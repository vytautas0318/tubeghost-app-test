// Pure logic for the desktop OAuth handoff, shared between the Edge Functions
// and the test suite.
//
// The Edge Functions run on Deno and keep their own copy of the I/O helpers
// (service-role fetch, secrets) in supabase/functions/_shared/oauth-handoff.ts.
// The decision logic below has no I/O, so it lives here where vitest can reach
// it — the Deno side re-derives the same rules, and these tests pin them.
//
// Everything here uses Web Crypto, which is present in both runtimes.

export type HandoffError =
  | 'access_denied'
  | 'invalid_state'
  | 'exchange_failed'
  | 'expired'
  | 'already_claimed'
  | 'invalid_verifier'
  | 'rate_limited'
  | 'server_error'

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url(sha256(input)) — the challenge/nonce derivation. */
export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return base64UrlEncode(new Uint8Array(digest))
}

/** Constant-time compare that leaks neither length nor first-difference
 *  position (both sides are hashed to equal-length buffers first). */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ])
  const va = new Uint8Array(ha)
  const vb = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

/** Shape of a base64url(sha256(...)) value: 43 chars, URL-safe alphabet. */
export const B64URL_SHA256 = /^[A-Za-z0-9_-]{43}$/

export interface IdTokenClaims {
  aud?: string
  iss?: string
  exp?: number
  nonce?: string
}

export const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

/** Verify a Google id_token binds to this client and this flow.
 *
 *  Signature verification is intentionally out of scope: the token is read
 *  from Google's token endpoint over TLS in response to a request carrying
 *  our client secret. What must be checked is that it was minted for US
 *  (aud), by GOOGLE (iss), is still valid (exp), and belongs to THIS handoff
 *  (nonce). */
export async function verifyIdTokenClaims(
  claims: IdTokenClaims | null,
  expected: { clientId: string; hashedNonce: string; now?: number }
): Promise<boolean> {
  if (!claims) return false
  const now = expected.now ?? Date.now()
  if (claims.aud !== expected.clientId) return false
  if (!claims.iss || !VALID_ISSUERS.includes(claims.iss)) return false
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return false
  if (!claims.nonce) return false
  return await timingSafeEqual(claims.nonce, expected.hashedNonce)
}

/** Decode a JWT payload without verifying the signature. */
export function decodeClaims(jwt: string): IdTokenClaims | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    const pad = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(pad)) as IdTokenClaims
  } catch {
    return null
  }
}

export interface HandoffRow {
  sid: string
  challenge: string
  hashed_nonce: string
  id_token: string | null
  expires_at: string
}

export type ClaimResult =
  | { ok: true; id_token: string }
  | { ok: false; error: HandoffError; status: number }

/** Decide the outcome of a claim, given the row the atomic delete consumed
 *  (or null) plus the state of any row left behind.
 *
 *  `consumed` is the row returned by the delete-returning statement; null
 *  means nothing matched. `residualState` describes what a follow-up lookup
 *  found, and is only consulted on the failure path. */
export async function resolveClaim(
  consumed: HandoffRow | null,
  verifier: string,
  residualState: 'missing' | 'expired' | 'pending'
): Promise<ClaimResult> {
  if (!consumed) {
    if (residualState === 'expired') return { ok: false, error: 'expired', status: 400 }
    // Row exists and is unexpired but has no id_token yet — the browser half
    // is still in flight, so this is a retryable state, not a failure.
    if (residualState === 'pending') return { ok: false, error: 'invalid_state', status: 409 }
    // Gone entirely: never existed, or a prior claim consumed it. The two are
    // indistinguishable by design.
    return { ok: false, error: 'already_claimed', status: 400 }
  }

  const derived = await sha256Base64Url(verifier)
  if (!(await timingSafeEqual(derived, consumed.challenge))) {
    // The row is already deleted at this point — a wrong verifier burns the
    // sid, so a guessed sid gets exactly one attempt.
    return { ok: false, error: 'invalid_verifier', status: 403 }
  }
  if (!consumed.id_token) return { ok: false, error: 'server_error', status: 500 }
  return { ok: true, id_token: consumed.id_token }
}

/** Build the Google authorization URL. Kept pure so the parameter set is
 *  pinned by a test rather than by reading the deployed function. */
export function buildGoogleAuthUrl(opts: {
  clientId: string
  redirectUri: string
  sid: string
  hashedNonce: string
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', opts.sid)
  url.searchParams.set('nonce', opts.hashedNonce)
  url.searchParams.set('access_type', 'online')
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}
