// Catch-all router for the dashboard device endpoints. Consolidates
// list / pairing-code / revoke into ONE serverless function (Vercel Hobby caps
// at 12). Logic is unchanged — handlers live in api/_lib/handlers/devices/.
//
//   GET    /api/devices               → list
//   POST   /api/devices/pairing-code  → pairing-code
//   DELETE /api/devices/:id           → revoke

import type { VercelRequest, VercelResponse } from '@vercel/node'
import list from '../_lib/handlers/devices/list.js'
import pairingCode from '../_lib/handlers/devices/pairing-code.js'
import revoke from '../_lib/handlers/devices/revoke.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const raw = req.query.id
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : []

  // /api/devices  (no trailing segment)
  if (segments.length === 0) {
    if (req.method === 'GET') return await list(req, res)
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  // /api/devices/pairing-code
  if (segments.length === 1 && segments[0] === 'pairing-code') {
    return await pairingCode(req, res)
  }

  // /api/devices/:id  (revoke). Normalize req.query.id to the single id the
  // handler expects (it reads String(req.query.id)).
  if (segments.length === 1) {
    req.query.id = segments[0]
    return await revoke(req, res)
  }

  res.status(404).json({ error: 'not_found' })
}
