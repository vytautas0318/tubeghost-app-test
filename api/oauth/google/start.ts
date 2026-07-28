// POST /api/oauth/google/start — begin a desktop OAuth handoff.
//
// CALLED BY: the Electron main process, before opening the system browser.
//
// The server builds the Google authorization URL so the desktop app ships no
// Google client id — credentials rotate without a new desktop release.
//
// Request:  { challenge, hashed_nonce, client: { platform, version } }
// Response: { sid, auth_url } | { error }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  GOOGLE_CLIENT_ID,
  OAUTH_REDIRECT_URI,
  checkRateLimit,
  clientIp,
  insertHandoff,
  isConfigured,
  randomSid,
  sweepExpired
} from '../../_lib/handoff.js'

// 10 sign-in attempts per IP per 5 minutes. Generous for a human, tight
// enough that a sid-guessing script can't farm fresh flows.
const RATE_LIMIT = 10
const RATE_WINDOW_SECONDS = 300

// Both values are base64url(sha256(...)) → exactly 43 chars, fixed alphabet.
const B64URL_SHA256 = /^[A-Za-z0-9_-]{43}$/

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  if (!isConfigured()) {
    res.status(500).json({ error: 'server_error' })
    return
  }

  const ip = clientIp(req)
  if (!(await checkRateLimit(`start:${ip}`, RATE_LIMIT, RATE_WINDOW_SECONDS))) {
    res.status(429).json({ error: 'rate_limited' })
    return
  }

  // Vercel parses JSON bodies automatically, but a non-JSON content-type
  // leaves `body` a string — handle both rather than trusting the header.
  let body: Record<string, unknown>
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  } catch {
    res.status(400).json({ error: 'invalid JSON body' })
    return
  }

  const challenge = String(body.challenge ?? '').trim()
  const hashedNonce = String(body.hashed_nonce ?? '').trim()
  if (!B64URL_SHA256.test(challenge)) {
    res.status(400).json({ error: 'invalid challenge' })
    return
  }
  if (!B64URL_SHA256.test(hashedNonce)) {
    res.status(400).json({ error: 'invalid hashed_nonce' })
    return
  }

  // Opportunistic cleanup — keeps the table small even if pg_cron isn't
  // enabled on the project. Never throws.
  await sweepExpired()

  const client = (body.client ?? {}) as { platform?: string; version?: string }
  const sid = randomSid()
  try {
    await insertHandoff({
      sid,
      challenge,
      hashed_nonce: hashedNonce,
      // Telemetry only — never used for auth decisions. Truncated so a
      // malicious client can't write large rows.
      platform: String(client.platform ?? '').slice(0, 32) || null,
      app_version: String(client.version ?? '').slice(0, 32) || null
    })
  } catch {
    res.status(500).json({ error: 'server_error' })
    return
  }

  // `nonce` carries the HASHED nonce: Google echoes it verbatim into the
  // id_token, and the callback compares it against the stored value. The raw
  // nonce never leaves the desktop app, so an id_token minted for a different
  // flow can't be replayed into this one.
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('state', sid)
  authUrl.searchParams.set('nonce', hashedNonce)
  authUrl.searchParams.set('access_type', 'online')
  authUrl.searchParams.set('prompt', 'select_account')

  res.status(200).json({ sid, auth_url: authUrl.toString() })
}
