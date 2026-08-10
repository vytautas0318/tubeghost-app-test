// /api/billing/<action> — checkout + portal, dispatched from one function.
//
// Consolidation note: this + webhook.ts = 2 functions for the whole billing
// group, matching the devices/agent grouping convention.
//
// The webhook is deliberately NOT here: it needs the raw request body for
// signature verification, and body parsing is configured per-file.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import checkout from '../_lib/handlers/billing/checkout.js'
import portal from '../_lib/handlers/billing/portal.js'
import order from '../_lib/handlers/billing/order.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = String(req.query.action ?? '')
  switch (action) {
    case 'checkout':
      return await checkout(req, res)
    case 'portal':
      return await portal(req, res)
    case 'order':
      return await order(req, res)
    default:
      res.status(404).json({ error: 'not_found' })
  }
}
