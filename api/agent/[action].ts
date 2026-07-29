// Catch-all router for the device agent endpoints. Consolidates
// pair/refresh/poll/result/heartbeat into ONE serverless function (Vercel Hobby
// caps functions at 12). Each handler's logic is unchanged — it lives in
// api/_lib/handlers/agent/ and is dispatched here by the :action segment.
//
//   POST /api/agent/pair | refresh | poll | result | heartbeat

import type { VercelRequest, VercelResponse } from '@vercel/node'
import pair from '../_lib/handlers/agent/pair.js'
import refresh from '../_lib/handlers/agent/refresh.js'
import poll from '../_lib/handlers/agent/poll.js'
import result from '../_lib/handlers/agent/result.js'
import heartbeat from '../_lib/handlers/agent/heartbeat.js'

// poll long-holds the request; keep the 60s ceiling on this consolidated fn.
export const config = { maxDuration: 60 }

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void
const ROUTES: Record<string, Handler> = { pair, refresh, poll, result, heartbeat }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = String(Array.isArray(req.query.action) ? req.query.action[0] : req.query.action ?? '')
  const fn = ROUTES[action]
  if (!fn) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  await fn(req, res)
}
