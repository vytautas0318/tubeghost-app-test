// ============================================================================
// totp — SINGLE-FILE build for pasting into the Supabase dashboard editor.
//
// This is the deploy artifact: supabase/functions/totp/index.ts with its three
// ../_shared/*.ts imports inlined so it's one self-contained file. The repo
// keeps them split; keep the two in sync if you edit either.
//
// Requires ONE Edge secret: TOTP_ENC_KEY (32 bytes, base64).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase.
// ============================================================================

// ── inlined from _shared/cors.ts ────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ── inlined from _shared/auth.ts ────────────────────────────────────────────
interface JWTPayload {
  sub: string
  email?: string
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
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as JWTPayload
    return payload.sub ?? null
  } catch {
    return null
  }
}

// ── inlined from _shared/totp-crypto.ts ─────────────────────────────────────
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function b64encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}
function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

let cachedKey: CryptoKey | null = null

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const raw = Deno.env.get('TOTP_ENC_KEY')
  if (!raw) throw new Error('TOTP_ENC_KEY is not configured on the server')
  const keyBytes = b64decode(raw.trim())
  if (keyBytes.length !== 32) {
    throw new Error('TOTP_ENC_KEY must be 32 bytes (base64-encoded)')
  }
  cachedKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
  return cachedKey
}

async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext))
  )
  return `v1.${b64encode(iv)}.${b64encode(ct)}`
}

async function decryptSecret(stored: string): Promise<string> {
  const parts = stored.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new Error('unrecognized ciphertext format')
  }
  const key = await getKey()
  const iv = b64decode(parts[1])
  const ct = b64decode(parts[2])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return decoder.decode(pt)
}

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('invalid base32 secret')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((value >>> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

const HASH_NAME: Record<string, string> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512'
}

interface TotpParams {
  secret: string
  algorithm?: string
  digits?: number
  period?: number
  atSeconds?: number
}

async function generateTotp(p: TotpParams): Promise<string> {
  const algorithm = (p.algorithm ?? 'SHA1').toUpperCase()
  const hash = HASH_NAME[algorithm]
  if (!hash) throw new Error(`unsupported algorithm ${algorithm}`)
  const digits = p.digits ?? 6
  const period = p.period ?? 30
  const now = p.atSeconds ?? Math.floor(Date.now() / 1000)
  const counter = Math.floor(now / period)

  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff
    c = Math.floor(c / 256)
  }

  const key = await crypto.subtle.importKey('raw', base32Decode(p.secret), { name: 'HMAC', hash }, false, [
    'sign'
  ])
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(bin % 10 ** digits).padStart(digits, '0')
}

async function validateSecret(secret: string): Promise<boolean> {
  try {
    await generateTotp({ secret })
    return true
  } catch {
    return false
  }
}

// ── function body (from totp/index.ts) ──────────────────────────────────────
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
    'Content-Type': 'application/json',
    // Since the DB consolidation every TubeGhost table + RPC lives in the
    // `ghost` schema of the shared project. PostgREST picks the schema via
    // these headers (Accept-Profile for GET, Content-Profile for writes/RPC);
    // without them it resolves names in `public` and finds nothing.
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
