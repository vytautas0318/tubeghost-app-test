// POST /api/agent/pair — the desktop app redeems a pairing code for a device
// token pair.
//
// CALLED BY: the Electron main process, server-to-server. NOT a browser call.
//
// Atomically consumes the code (single use), creates a device row owned by the
// code's user, and returns the plaintext token + refreshToken ONCE. Only their
// sha256 hashes are stored.
//
// Request:  { code, name, platform, appVersion }
// Response: { deviceId, token, refreshToken } | { error }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../_lib/env.js'
import { consumePairingCode, insertDevice } from '../_lib/db.js'
import { hashToken, mintTokenPair } from '../_lib/device-token.js'

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

  const body = parseBody(req)
  const code = String(body.code ?? '')
    .trim()
    .toUpperCase()
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(code)) {
    res.status(400).json({ error: 'invalid_code' })
    return
  }

  const userId = await consumePairingCode(code)
  if (!userId) {
    // Expired, already consumed, or never existed — indistinguishable by design.
    res.status(400).json({ error: 'code_invalid_or_expired' })
    return
  }

  const { token, refreshToken } = mintTokenPair()
  try {
    const device = await insertDevice({
      user_id: userId,
      name: String(body.name ?? 'TubeGhost device').slice(0, 80),
      platform: String(body.platform ?? '').slice(0, 32) || null,
      app_version: String(body.appVersion ?? '').slice(0, 32) || null,
      token_hash: hashToken(token),
      refresh_token_hash: hashToken(refreshToken),
    })
    res.status(200).json({ deviceId: device.id, token, refreshToken })
  } catch {
    res.status(500).json({ error: 'server_error' })
  }
}
