// session-key — hand the caller the per-workspace AES key used to
// encrypt/decrypt that workspace's browser-session snapshots.
//
// Why an Edge Function: the master SESSION_ENC_KEY is a real secret and must
// NEVER ship in the renderer/main bundle. The client asks for a per-workspace
// derived key (HKDF), then does AES-256-GCM of the archive LOCALLY — the large
// archive never transits this function. Gated by sessions.sync, exactly the
// tier used for cookie/2FA export: a member who can pull a decrypted session
// is one who could already export logins.
//
// POST { action: 'key', workspace_id } → { key }   (base64, 32 bytes)

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'
import { deriveWorkspaceKey } from '../_shared/session-key.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

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

  if (String(body.action ?? '') !== 'key') {
    return jsonResponse({ error: `unknown action ${body.action}` }, 400)
  }

  const workspaceId = String(body.workspace_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    return jsonResponse({ error: 'invalid workspace_id' }, 400)
  }
  if (!(await hasPermission(userId, 'sessions.sync', workspaceId))) {
    return jsonResponse({ error: 'permission denied' }, 403)
  }

  try {
    const key = await deriveWorkspaceKey(workspaceId)
    return jsonResponse({ key })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: msg }, 500)
  }
})
