// session-key — hand the caller the per-workspace AES key used to
// encrypt/decrypt that workspace's browser-session snapshots.
//
// SELF-CONTAINED build for the Supabase Dashboard function editor: the
// _shared/{cors,auth,session-key}.ts helpers are inlined below because the
// browser editor can't resolve relative imports. The canonical split-file
// source lives beside this file in index.ts — keep them in sync if you edit
// either. This file is NOT used by the CLI deploy (it deploys index.ts); it
// exists only so the exact paste-into-dashboard text is version-controlled.
//
// POST { action: 'key', workspace_id } -> { key }   (base64, 32 bytes)

// ── inlined _shared/cors.ts ────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return null
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ── inlined _shared/auth.ts ────────────────────────────────────────────────
interface JWTPayload {
  sub: string
  exp: number
  [k: string]: unknown
}
function getUserIdFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.slice('Bearer '.length).trim()
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    ) as JWTPayload
    return payload.sub ?? null
  } catch {
    return null
  }
}

// ── inlined _shared/session-key.ts (HKDF per-workspace key derivation) ──────
function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}
function b64encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}
const encoder = new TextEncoder()
let cachedMaster: CryptoKey | null = null

async function getMaster(): Promise<CryptoKey> {
  if (cachedMaster) return cachedMaster
  const raw = Deno.env.get('SESSION_ENC_KEY')
  if (!raw) throw new Error('SESSION_ENC_KEY is not configured on the server')
  const keyBytes = b64decode(raw.trim())
  if (keyBytes.length !== 32) {
    throw new Error('SESSION_ENC_KEY must be 32 bytes (base64-encoded)')
  }
  cachedMaster = await crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, ['deriveBits'])
  return cachedMaster
}

async function deriveWorkspaceKey(workspaceId: string): Promise<string> {
  const master = await getMaster()
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('tubeghost.session.v1'),
      info: encoder.encode(`workspace:${workspaceId}`)
    },
    master,
    256
  )
  return b64encode(new Uint8Array(bits))
}

// ── function body ──────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

function svcHeaders(): HeadersInit {
  return {
    apikey: SERVICE_ROLE_KEY ?? '',
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    // TubeGhost tables + RPCs live in the `ghost` schema of the shared
    // project since the DB consolidation — PostgREST selects it by header.
    'Accept-Profile': 'ghost',
    'Content-Profile': 'ghost'
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

  // deno-lint-ignore no-explicit-any
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
