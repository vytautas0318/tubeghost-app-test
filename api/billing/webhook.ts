// POST /api/billing/webhook — Stripe event receiver.
//
// Its own function (not folded into [action].ts) because signature
// verification needs the RAW body, and `bodyParser: false` is per-file.
// Vercel would otherwise hand us a parsed object whose re-serialisation
// doesn't match the bytes Stripe signed, failing every verification.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import webhook from '../_lib/handlers/billing/webhook.js'

export const config = { api: { bodyParser: false } }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  return await webhook(req, res)
}
