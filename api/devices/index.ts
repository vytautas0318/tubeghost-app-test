// GET /api/devices — list the user's devices. (Split from the [id] route
// because Vercel's optional catch-all doesn't reliably match the bare path.)
// Consolidation note: this + [id].ts = 2 functions for the whole devices group.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import list from '../_lib/handlers/devices/list.js'
import pairingCode from '../_lib/handlers/devices/pairing-code.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // /api/devices/pairing-code also lands here on some Vercel routings; dispatch
  // by URL so both the bare list and the pairing-code POST work from one fn.
  const path = (req.url ?? '').split('?')[0]
  if (/\/api\/devices\/pairing-code\/?$/.test(path)) {
    return await pairingCode(req, res)
  }
  if (req.method === 'GET') return await list(req, res)
  res.status(405).json({ error: 'method_not_allowed' })
}
