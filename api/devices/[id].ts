// /api/devices/:id and /api/devices/pairing-code — dispatched by URL.
//   DELETE /api/devices/:id           → revoke
//   POST   /api/devices/pairing-code  → pairing-code
// Routing on req.url (not the dynamic param) is deterministic on Vercel,
// including rewrites.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import pairingCode from '../_lib/handlers/devices/pairing-code.js'
import revoke from '../_lib/handlers/devices/revoke.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const path = (req.url ?? '').split('?')[0]
  const seg = decodeURIComponent(path.replace(/^\/api\/devices\//, '').replace(/\/+$/, ''))

  if (seg === 'pairing-code') {
    return await pairingCode(req, res)
  }
  if (seg) {
    // revoke reads String(req.query.id) — set it from the path segment.
    req.query.id = seg
    return await revoke(req, res)
  }
  res.status(404).json({ error: 'not_found' })
}
