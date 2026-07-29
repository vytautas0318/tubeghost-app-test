// POST /api/agent/refresh — the desktop app rotates its device tokens.
//
// CALLED BY: the Electron main process before its access token would expire, or
//            after a 401. Presents the refresh token; receives a fresh pair.
//
// ROTATION: both tokens are replaced on every refresh. Because the old refresh
// hash is overwritten, a replayed refresh token no longer matches any row →
// 401. (The full refresh-reuse-revokes-chain guarantee is validated in Phase 6.)
//
// Request:  { refreshToken }
// Response: { deviceId, token, refreshToken } | { error }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../_lib/env.js'
import { patchDevice } from '../_lib/db.js'
import { authenticateRefresh, hashToken, mintTokenPair } from '../_lib/device-token.js'

function parseBody(req: VercelRequest): Record<string, unknown> {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  } catch {
    return {}
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!relayConfigured()) {
    res.status(500).json({ error: 'server_error' })
    return
  }

  const presented = String(parseBody(req).refreshToken ?? '').trim()
  const auth = await authenticateRefresh(presented)
  if (!auth.ok) {
    res.status(401).json({ error: auth.reason === 'revoked' ? 'revoked' : 'invalid_refresh_token' })
    return
  }

  const { token, refreshToken } = mintTokenPair()
  try {
    await patchDevice(auth.device.id, {
      token_hash: hashToken(token),
      refresh_token_hash: hashToken(refreshToken),
    })
    res.status(200).json({ deviceId: auth.device.id, token, refreshToken })
  } catch {
    res.status(500).json({ error: 'server_error' })
  }
}
