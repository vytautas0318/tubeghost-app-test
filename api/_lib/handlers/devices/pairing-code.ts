// POST /api/devices/pairing-code — the dashboard generates a pairing code.
//
// CALLED BY: the SPA (Settings → Claude), with the user's Supabase access token
//            as `Authorization: Bearer <token>`. Reuses the existing login
//            session — no second auth system.
//
// Response: { code, expiresAt } | { error }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../../env.js'
import { requireSession } from '../../session.js'
import { mintPairingCode } from '../../db.js'

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

  const session = await requireSession(req.headers.authorization)
  if (!session) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    const { code, expiresAt } = await mintPairingCode(session.userId)
    res.status(200).json({ code, expiresAt })
  } catch {
    res.status(500).json({ error: 'server_error' })
  }
}
