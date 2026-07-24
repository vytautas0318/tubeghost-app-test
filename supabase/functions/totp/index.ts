// totp — server-side TOTP encryption, code generation, and seed reveal.
//
// Why an Edge Function: the AES-GCM key (TOTP_ENC_KEY) is a real secret and
// must NEVER ship to the renderer. All plaintext Base32 seeds live only for
// the duration of a request here; the DB and renderer hold ciphertext only.
//
// Actions (POST { action, ... }):
//   'encrypt'  { secret, algorithm?, digits?, period? }
//               → { ok, secret_encrypted }   (enroll — validates the seed)
//   'generate' { token_ids: string[], at_seconds? }
//               → { codes: { [id]: string } } (gated: twofa.view per workspace)
//   'reveal'   { token_id }
//               → { secret }                  (gated: twofa.reveal_seed)
//   'export'   { workspace_id }
//               → { tokens: [{ id, issuer, handle, secret, algorithm, digits, period }] }
//                                             (gated: twofa.export)
//
// Every action requires a valid caller JWT. generate/reveal/export
// re-derive the workspace from the DB row(s) and check_user_permission
// against it — the client cannot spoof its own authorization.

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'
import {
  encryptSecret,
  decryptSecret,
  generateTotp,
  validateSecret
} from '../_shared/totp-crypto.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

interface TokenRow {
  id: string
  workspace_id: string
  issuer: string
  handle: string | null
  secret_encrypted: string
  algorithm: string
  digits: number
  period: number
}

function svcHeaders(): HeadersInit {
  return {
    apikey: SERVICE_ROLE_KEY ?? '',
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  }
}

async function hasPermission(userId: string, key: string, workspaceId: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_user_permission`, {
    method: 'POST',
    headers: svcHeaders(),
    body: JSON.stringify({ p_user_id: userId, p_permission_key: key, p_workspace_id: workspaceId })
  })
  if (!res.ok) return false
  return (await res.json()) === true
}

async function fetchTokens(filter: string): Promise<TokenRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/authenticator_tokens?select=id,workspace_id,issuer,handle,secret_encrypted,algorithm,digits,period&${filter}`,
    { headers: svcHeaders() }
  )
  if (!res.ok) return []
  return (await res.json()) as TokenRow[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handle(action: string, body: any, userId: string): Promise<Response> {
  if (action === 'encrypt') {
    const secret = String(body.secret ?? '').trim()
    if (!(await validateSecret(secret))) {
      return jsonResponse({ error: 'invalid base32 secret' }, 400)
    }
    return jsonResponse({ ok: true, secret_encrypted: await encryptSecret(secret) })
  }

  if (action === 'generate') {
    const ids: string[] = Array.isArray(body.token_ids) ? body.token_ids : []
    if (ids.length === 0) return jsonResponse({ codes: {} })
    const at = typeof body.at_seconds === 'number' ? body.at_seconds : undefined
    const inList = ids.map((i) => `"${i}"`).join(',')
    const rows = await fetchTokens(`id=in.(${inList})`)
    // One permission check per distinct workspace touched.
    const okWorkspaces = new Map<string, boolean>()
    const codes: Record<string, string> = {}
    for (const r of rows) {
      let allowed = okWorkspaces.get(r.workspace_id)
      if (allowed === undefined) {
        allowed = await hasPermission(userId, 'twofa.view', r.workspace_id)
        okWorkspaces.set(r.workspace_id, allowed)
      }
      if (!allowed) continue
      try {
        codes[r.id] = await generateTotp({
          secret: await decryptSecret(r.secret_encrypted),
          algorithm: r.algorithm,
          digits: r.digits,
          period: r.period,
          atSeconds: at
        })
      } catch {
        /* skip a corrupt row rather than fail the whole batch */
      }
    }
    return jsonResponse({ codes })
  }

  if (action === 'reveal') {
    const id = String(body.token_id ?? '')
    const rows = await fetchTokens(`id=eq.${id}`)
    const row = rows[0]
    if (!row) return jsonResponse({ error: 'not found' }, 404)
    if (!(await hasPermission(userId, 'twofa.reveal_seed', row.workspace_id))) {
      return jsonResponse({ error: 'permission denied' }, 403)
    }
    return jsonResponse({ secret: await decryptSecret(row.secret_encrypted) })
  }

  if (action === 'export') {
    const workspaceId = String(body.workspace_id ?? '')
    if (!(await hasPermission(userId, 'twofa.export', workspaceId))) {
      return jsonResponse({ error: 'permission denied' }, 403)
    }
    const rows = await fetchTokens(`workspace_id=eq.${workspaceId}`)
    const tokens = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        issuer: r.issuer,
        handle: r.handle,
        secret: await decryptSecret(r.secret_encrypted),
        algorithm: r.algorithm,
        digits: r.digits,
        period: r.period
      }))
    )
    return jsonResponse({ tokens })
  }

  return jsonResponse({ error: `unknown action ${action}` }, 400)
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'server not configured' }, 500)
  }

  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonResponse({ error: 'authentication required' }, 401)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  try {
    return await handle(String(body.action ?? ''), body, userId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg }, 500)
  }
})
