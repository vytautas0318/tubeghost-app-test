// GET /api/oauth/google/callback — Google redirects the user's browser here.
//
// This route's public URL is the value registered with Google as an
// authorized redirect URI, and is passed to /start as OAUTH_REDIRECT_URI.
//
// Exchanges the one-time `code` for an id_token, verifies it, stores it on the
// handoff row, and bounces the browser to /auth-client, which triggers the
// tubeghost:// deep link.
//
// Every response is a 302 — the user is looking at a browser window, not a
// JSON client. Failures carry ?error=<code> so /auth-client can pass the code
// through to the desktop app.
//
// Request:  ?code=<google code>&state=<sid>
// Response: 302 → /auth-client?sid=…[&error=…]

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  AUTH_CLIENT_PATH,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  type HandoffError,
  getPendingHandoff,
  isConfigured,
  originOf,
  storeIdToken,
  timingSafeEqual
} from '../../_lib/handoff.js'

interface GoogleTokenResponse {
  id_token?: string
  error?: string
}

interface IdTokenClaims {
  aud?: string
  iss?: string
  exp?: number
  nonce?: string
}

/** Decode a JWT payload without verifying the signature.
 *
 *  Safe here, and deliberately dependency-free: the token arrives over TLS
 *  directly from Google's token endpoint in response to a request carrying our
 *  client secret. That channel — not the signature — is what authenticates it.
 *  We still check aud/iss/exp/nonce below, because those bind the token to
 *  THIS client and THIS flow. */
function decodeClaims(jwt: string): IdTokenClaims | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as IdTokenClaims
  } catch {
    return null
  }
}

const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = originOf(req)

  const redirect = (sid: string, error?: HandoffError): void => {
    const url = new URL(AUTH_CLIENT_PATH, origin)
    if (sid) url.searchParams.set('sid', sid)
    if (error) url.searchParams.set('error', error)
    res.setHeader('Cache-Control', 'no-store')
    res.redirect(302, url.toString())
  }

  if (req.method !== 'GET') {
    res.status(405).send('method not allowed')
    return
  }
  if (!isConfigured()) {
    redirect('', 'server_error')
    return
  }

  const q = req.query
  const one = (v: string | string[] | undefined): string =>
    (Array.isArray(v) ? v[0] : v ?? '').trim()

  const sid = one(q.state)
  const code = one(q.code)
  const providerError = one(q.error)

  // No usable state → nothing to hand back to; the desktop app will time out
  // its own pending flow.
  if (!sid) {
    redirect('', 'invalid_state')
    return
  }

  // The user hit "Cancel" on the consent screen.
  if (providerError) {
    redirect(sid, providerError === 'access_denied' ? 'access_denied' : 'exchange_failed')
    return
  }
  if (!code) {
    redirect(sid, 'exchange_failed')
    return
  }

  // The row must exist AND be unexpired. A replayed/forged state lands here.
  const row = await getPendingHandoff(sid)
  if (!row) {
    redirect(sid, 'invalid_state')
    return
  }

  // Exchange the code. This is the only place the client secret is used.
  let idToken: string
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: OAUTH_REDIRECT_URI,
        grant_type: 'authorization_code'
      }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!tokenRes.ok) {
      redirect(sid, 'exchange_failed')
      return
    }
    const data = (await tokenRes.json()) as GoogleTokenResponse
    if (!data.id_token) {
      redirect(sid, 'exchange_failed')
      return
    }
    idToken = data.id_token
  } catch {
    // Network failure / timeout. Never log the response body — it carries
    // tokens.
    redirect(sid, 'exchange_failed')
    return
  }

  // ── Verify the token binds to this client and this flow ──────────
  const claims = decodeClaims(idToken)
  if (!claims) {
    redirect(sid, 'exchange_failed')
    return
  }
  if (claims.aud !== GOOGLE_CLIENT_ID) {
    redirect(sid, 'exchange_failed')
    return
  }
  if (!claims.iss || !VALID_ISSUERS.includes(claims.iss)) {
    redirect(sid, 'exchange_failed')
    return
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    redirect(sid, 'exchange_failed')
    return
  }
  // The nonce Google echoes back must equal the hashed nonce stored at /start.
  if (!claims.nonce || !timingSafeEqual(claims.nonce, row.hashed_nonce)) {
    redirect(sid, 'exchange_failed')
    return
  }

  try {
    await storeIdToken(sid, idToken)
  } catch {
    redirect(sid, 'server_error')
    return
  }

  redirect(sid)
}
