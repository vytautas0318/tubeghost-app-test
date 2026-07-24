// auth-exchange — trade a TubeProxies session for a TP Browser session.
//
// DEPLOY: TP Browser project (kyolnnzjhzwjnssijhlo), --no-verify-jwt.
// CALLED BY: the Electron renderer right after signing in against
//            TubeProxies (the identity provider), and whenever the TP
//            Browser session needs refreshing.
//
// Why this exists: TubeProxies signs user sessions with ES256 and TP
// Browser's PostgREST only trusts TP Browser's OWN keys, so a raw
// TubeProxies token is rejected (PGRST301). We therefore:
//   1. Verify the TubeProxies token ourselves against its JWKS (ES256).
//   2. Confirm the user is mirrored into public.users.
//   3. Ensure an auth.users row exists with id == the TubeProxies sub
//      (so auth.uid() lines up with public.users + all FKs), using the
//      service-role Admin API. Created idempotently.
//   4. Mint a real TP Browser GoTrue session for that user (magiclink ->
//      verify) and return access_token + refresh_token. The session is
//      signed with TP Browser's own key, so PostgREST accepts it and the
//      renderer's supabase-js can refresh it normally. No legacy JWT
//      secret needed.
//
// Secrets (TP Browser edge secrets, already set):
//   TUBEPROXIES_ISSUER, TUBEPROXIES_JWKS_URL
//   SELF_SUPABASE_URL, SELF_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//
// Request:  POST { access_token: <TubeProxies JWT> }  (or Bearer header)
// Response: { access_token, refresh_token, token_type, expires_in,
//             expires_at, user:{id,email} } | { error }

import { verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const ISSUER = Deno.env.get('TUBEPROXIES_ISSUER') ?? ''
const JWKS_URL =
  Deno.env.get('TUBEPROXIES_JWKS_URL') ?? (ISSUER ? `${ISSUER}/.well-known/jwks.json` : '')
const SELF_URL = Deno.env.get('SELF_SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SELF_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

// ── JWKS cache (TubeProxies ES256 public keys) ─────────────────────
let jwksCache: { keys: JsonWebKey[]; at: number } | null = null
async function getJwks(): Promise<JsonWebKey[]> {
  if (jwksCache && Date.now() - jwksCache.at < 10 * 60_000) return jwksCache.keys
  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
  const keys = (await res.json()).keys ?? []
  jwksCache = { keys, at: Date.now() }
  return keys
}

interface TpClaims {
  sub: string
  email?: string
  iss?: string
}

async function verifyTubeProxiesToken(token: string): Promise<TpClaims | null> {
  const [h] = token.split('.')
  if (!h) return null
  let kid: string | undefined
  try {
    kid = JSON.parse(atob(h.replace(/-/g, '+').replace(/_/g, '/'))).kid
  } catch {
    return null
  }
  const keys = await getJwks()
  const jwk = keys.find((k) => (k as { kid?: string }).kid === kid) ?? keys[0]
  if (!jwk) return null
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
    const payload = (await verify(token, key)) as unknown as TpClaims
    if (ISSUER && payload.iss && payload.iss !== ISSUER) return null
    return payload
  } catch {
    return null
  }
}

// admin fetch helper
function admin(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${SELF_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  })
}

// Ensure an auth.users row exists with EXACTLY id == sub (the verified
// TubeProxies user id). Returns 'ok' when that row exists/was created, or
// 'email_conflict' when a DIFFERENT auth.users id already holds this email
// (a legacy pre-migration account) — in which case we must NOT mint a
// session, because doing so by email would log the user into the wrong
// identity. That collision is reconciled by the merge migration; until
// then we fail closed.
async function ensureAuthUser(id: string, email: string): Promise<'ok' | 'email_conflict'> {
  // Already present with the correct id?
  const get = await admin(`/auth/v1/admin/users/${id}`, { method: 'GET' })
  if (get.ok) {
    const u = await get.json()
    if (u?.id === id) return 'ok'
  }
  // Try to create with the exact id.
  const res = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ id, email, email_confirm: true })
  })
  if (res.ok) return 'ok'
  // Email already taken by a different id → conflict (fail closed).
  if (res.status === 422 || res.status === 409) return 'email_conflict'
  const txt = await res.text()
  throw new Error(`ensureAuthUser failed (${res.status}): ${txt.slice(0, 200)}`)
}

// Ensure the user has a TP Browser workspace (created lazily on first
// login). provision_mirrored_user is idempotent — no-op if they already
// belong to one. This backfills the ~3,250 users mirrored identity-only
// via the UPDATE webhook (which doesn't provision), so a real login
// always lands in a usable workspace and purchased-proxy sync can resolve
// their workspace.
async function provisionWorkspace(userId: string): Promise<void> {
  const res = await admin('/rest/v1/rpc/provision_mirrored_user', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: userId, p_workspace_name: null })
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`provision failed (${res.status}): ${txt.slice(0, 200)}`)
  }
}

// Mint a session via magiclink -> verify. Returns the parsed GoTrue
// session json. The email must be unique to `expectedId` (guaranteed by
// ensureAuthUser returning 'ok'); we ALSO assert the minted token's sub
// matches expectedId and throw otherwise — defence-in-depth against ever
// minting a session for the wrong identity.
function subOf(jwt: string): string | null {
  try {
    return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub ?? null
  } catch {
    return null
  }
}

async function mintSession(email: string, expectedId: string): Promise<Record<string, unknown>> {
  const gen = await admin('/auth/v1/admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email })
  })
  if (!gen.ok) throw new Error(`generate_link failed: ${gen.status}`)
  const hashed = (await gen.json()).hashed_token
  if (!hashed) throw new Error('generate_link returned no hashed_token')
  const verRes = await fetch(`${SELF_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashed })
  })
  if (!verRes.ok) throw new Error(`verify failed: ${verRes.status}`)
  const s = await verRes.json()
  if (!s.access_token) throw new Error('no session minted')
  const got = subOf(s.access_token)
  if (got !== expectedId) {
    // The email resolved to a different auth.users id — refuse.
    throw new Error(`identity mismatch: minted sub ${got} != expected ${expectedId}`)
  }
  return s
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!ISSUER || !SELF_URL || !SERVICE_KEY) return json({ error: 'exchange not configured' }, 500)

  let token = ''
  try {
    token = (await req.json().catch(() => ({}))).access_token ?? ''
  } catch {
    /* ignore */
  }
  if (!token) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth.startsWith('Bearer ')) token = auth.slice(7).trim()
  }
  if (!token) return json({ error: 'missing access_token' }, 400)

  const claims = await verifyTubeProxiesToken(token)
  if (!claims?.sub || !claims.email) return json({ error: 'invalid TubeProxies token' }, 401)

  // Must be mirrored first (mirror-user webhook).
  const mRes = await admin(`/rest/v1/users?id=eq.${claims.sub}&select=id,email`, { method: 'GET' })
  const mirror = mRes.ok ? (await mRes.json())[0] : null
  if (!mirror) return json({ error: 'user not mirrored yet' }, 409)

  const emailForMint = (mirror.email as string) ?? claims.email
  try {
    // Fail CLOSED if this email is held by a different auth.users id (a
    // legacy pre-migration account). Minting by email would log the user
    // into the WRONG identity. Reconciled by the identity-merge migration.
    const ensured = await ensureAuthUser(claims.sub, emailForMint)
    if (ensured === 'email_conflict') {
      return json(
        { error: 'identity conflict: email is linked to a legacy account; reconciliation required' },
        409
      )
    }
    // Lazy workspace provisioning on first login (idempotent).
    await provisionWorkspace(claims.sub)
    // mintSession asserts the minted token's sub === claims.sub.
    const s = await mintSession(emailForMint, claims.sub)
    return json({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      token_type: s.token_type ?? 'bearer',
      expires_in: s.expires_in,
      expires_at: s.expires_at,
      user: { id: claims.sub, email: emailForMint }
    })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
