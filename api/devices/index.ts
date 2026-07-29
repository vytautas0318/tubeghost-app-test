// GET /api/devices — the dashboard lists the user's paired devices with live
// online/offline status.
//
// CALLED BY: the SPA (Settings → Claude), Authorization: Bearer <supabase token>.
//
// "online" = presence key exists in Redis (refreshed every ≤45s by the agent's
// poll/heartbeat). last_seen_at is the durable mirror for the offline case.
//
// Response: { devices: [{ id, name, platform, appVersion, online, lastSeenAt,
//                         writeEnabled, createdAt }] } | { error }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../_lib/env.js'
import { requireSession } from '../_lib/session.js'
import { listDevices } from '../_lib/db.js'
import { onlineSet } from '../_lib/bus.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
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

  const rows = await listDevices(session.userId)
  const online = await onlineSet(rows.map((d) => d.id))

  res.status(200).json({
    devices: rows.map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      appVersion: d.app_version,
      online: online.has(d.id),
      lastSeenAt: d.last_seen_at,
      writeEnabled: d.write_enabled,
      createdAt: d.created_at,
    })),
  })
}
