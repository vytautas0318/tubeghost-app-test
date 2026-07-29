// POST /api/agent/heartbeat — lightweight liveness ping between polls.
//
// CALLED BY: the Electron main process on a timer (and whenever it isn't
//            actively long-polling). Authorization: Bearer <device token>.
//
// Refreshes presence + last_seen_at (same as /poll does) and tells the app
// whether it has been revoked so it can stop and prompt a re-pair. `state` is
// opaque telemetry (e.g. open-session count) — accepted and ignored for now.
//
// Request:  { state? }
// Response: { ok: true, serverTime } | { ok: true, serverTime, revoked: true }
//
// Note: a revoked token can't even authenticate (authOrReject 401s with
// revoked:true), so reaching the body here means the device is still valid.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../../env.js'
import { patchDevice } from '../../db.js'
import { touchPresence } from '../../bus.js'
import { authOrReject } from '../../agent-http.js'

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

  const device = await authOrReject(req, res)
  if (!device) return

  await touchPresence(device.id)
  await patchDevice(device.id, { last_seen_at: new Date().toISOString() }).catch(() => {})

  res.status(200).json({ ok: true, serverTime: new Date().toISOString() })
}
