// POST /api/oauth/google/claim — the desktop app redeems a completed handoff.
//
// CALLED BY: the Electron MAIN process, server-to-server, after receiving the
//            tubeghost://auth/callback?sid=… deep link. Not a browser call, so
//            no CORS headers are set (and none are needed).
//
// Single use: the row is deleted in the same statement that reads it, so a
// second claim with the same sid always returns already_claimed.
//
// Request:  { sid, verifier }
// Response: { id_token } | { error }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  checkRateLimit,
  clientIp,
  consumeHandoff,
  handoffState,
  isConfigured,
  sha256Base64Url,
  timingSafeEqual
} from '../../_lib/handoff.js'

// Tighter than /start: a claim is one call per completed sign-in. A burst here
// means someone is enumerating sids.
const RATE_LIMIT = 20
const RATE_WINDOW_SECONDS = 300

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
  if (!(await checkRateLimit(`claim:${ip}`, RATE_LIMIT, RATE_WINDOW_SECONDS))) {
    res.status(429).json({ error: 'rate_limited' })
    return
  }

  let body: Record<string, unknown>
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  } catch {
    res.status(400).json({ error: 'invalid_sid' })
    return
  }

  const sid = String(body.sid ?? '').trim()
  const verifier = String(body.verifier ?? '').trim()
  if (!sid || !verifier) {
    res.status(400).json({ error: 'invalid_sid' })
    return
  }

  // Atomic read-and-delete. Matches only rows that are unexpired AND have an
  // id_token, so a flow still awaiting the browser half isn't consumed.
  let row
  try {
    row = await consumeHandoff(sid)
  } catch {
    res.status(500).json({ error: 'server_error' })
    return
  }

  if (!row) {
    // Nothing consumable. Work out which of the three cases it was so the
    // desktop app can show the right message. Costs one extra read, but only
    // on the failure path.
    const state = await handoffState(sid)
    if (state === 'expired') {
      res.status(400).json({ error: 'expired' })
      return
    }
    if (state === 'pending') {
      // Row exists, unexpired, but id_token is still null — the browser half
      // hasn't finished. The desktop app should keep waiting and retry.
      res.status(409).json({ error: 'invalid_state' })
      return
    }
    // Gone entirely: either never existed, or a previous claim consumed it.
    // Indistinguishable by design (the row is deleted either way), and
    // already_claimed is the case a legitimate client can actually hit.
    res.status(400).json({ error: 'already_claimed' })
    return
  }

  // The row is now GONE regardless of what follows. A wrong verifier burns the
  // sid — a guessed sid gets exactly one attempt, which is intended.
  if (!timingSafeEqual(sha256Base64Url(verifier), row.challenge)) {
    res.status(403).json({ error: 'invalid_verifier' })
    return
  }

  if (!row.id_token) {
    res.status(500).json({ error: 'server_error' })
    return
  }

  // Never logged, never cached.
  res.status(200).json({ id_token: row.id_token })
}
