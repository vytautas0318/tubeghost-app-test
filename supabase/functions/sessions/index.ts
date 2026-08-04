// sessions — real login-session management for the current user. The anon
// client can list/soft-revoke its OWN ledger rows (RLS), but only this
// service_role function can actually KILL a GoTrue refresh token, so
// "Revoke" / "Sign out everywhere" go through here.
//
// A user may only act on their OWN sessions — we scope every operation to the
// JWT's user id, never a client-supplied one.
//
// POST { action: 'revoke', session_id }              → { ok }
// POST { action: 'revoke_others', device_id }        → { ok, revoked }
//
// Implementation note: Supabase's admin API signs out ALL of a user's sessions
// (auth.admin.signOut(userId) via the GoTrue admin logout endpoint) — it does
// not expose per-refresh-token revocation. So:
//   • revoke_others → admin signOut(user) [kills every device incl. current],
//     then the current device silently re-establishes its session on the next
//     request (its refresh token is re-issued by the still-valid access token
//     in the caller's context is gone) — to keep the CURRENT device signed in
//     we instead mark the OTHER rows revoked and rely on their next
//     token-refresh failing. We DO call admin signOut with a scope when
//     available. See below.
// For a clean UX we (a) mark ledger rows revoked immediately so the UI updates,
// and (b) call the GoTrue admin logout so refresh tokens die. The current
// device holds a live session in supabase-js and re-authenticates transparently.

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

function svcHeaders(): HeadersInit {
  return {
    apikey: SERVICE_ROLE_KEY ?? '',
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    // TubeGhost tables + RPCs live in the `ghost` schema of the shared
    // project since the DB consolidation — PostgREST selects it by header.
    // (GoTrue /auth/v1 calls ignore these headers.)
    'Accept-Profile': 'ghost',
    'Content-Profile': 'ghost'
  }
}

// Mark ledger rows revoked (service_role bypasses RLS). Optionally keep one
// device_id alive (the caller's current device).
async function revokeLedger(
  userId: string,
  opts: { sessionId?: string; exceptDeviceId?: string }
): Promise<number> {
  let filter = `user_id=eq.${userId}&revoked_at=is.null`
  if (opts.sessionId) filter += `&id=eq.${opts.sessionId}`
  if (opts.exceptDeviceId) filter += `&device_id=neq.${encodeURIComponent(opts.exceptDeviceId)}`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_login_sessions?${filter}`, {
    method: 'PATCH',
    headers: { ...svcHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({ revoked_at: new Date().toISOString() })
  })
  if (!res.ok) throw new Error(`ledger update failed: ${res.status}`)
  const rows = (await res.json()) as unknown[]
  return rows.length
}

// Kill the user's GoTrue refresh tokens via the admin logout endpoint. Scope
// 'others' preserves the caller's current session where the runtime supports
// it; we pass it best-effort.
async function adminSignOut(userId: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}/logout`, {
    method: 'POST',
    headers: svcHeaders(),
    body: JSON.stringify({ scope: 'others' })
  })
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'server not configured' }, 500)
  }
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonResponse({ ok: false, error: 'authentication required' }, 401)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400)
  }

  const action = String(body.action ?? '')
  try {
    if (action === 'revoke') {
      const sessionId = String(body.session_id ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
        return jsonResponse({ ok: false, error: 'invalid session_id' }, 400)
      }
      const n = await revokeLedger(userId, { sessionId })
      // A single-device revoke can't be isolated at the token level, so kill
      // others' tokens (caller preserved via scope) to make it real.
      await adminSignOut(userId)
      return jsonResponse({ ok: true, revoked: n })
    }
    if (action === 'revoke_others') {
      const deviceId = String(body.device_id ?? '')
      if (!deviceId) return jsonResponse({ ok: false, error: 'device_id required' }, 400)
      const n = await revokeLedger(userId, { exceptDeviceId: deviceId })
      await adminSignOut(userId)
      return jsonResponse({ ok: true, revoked: n })
    }
    return jsonResponse({ ok: false, error: `unknown action ${action}` }, 400)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ ok: false, error: msg }, 500)
  }
})
