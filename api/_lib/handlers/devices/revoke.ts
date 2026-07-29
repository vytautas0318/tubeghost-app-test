// DELETE /api/devices/:id — the dashboard revokes a paired device.
//
// CALLED BY: the SPA (Settings → Claude), Authorization: Bearer <supabase token>.
//
// Revoking: null the token hashes + stamp revoked_at (kills both tokens), then
// drop the device's Redis queue + presence so an in-flight poll returns nothing
// and it immediately reads offline. Scoped to the owner — a user can only revoke
// their own device.
//
// (Rename + write_enabled toggle are done directly from the SPA via RLS-guarded
// PATCH on the devices table, so they need no endpoint here.)
//
// Response: { ok: true } | { error }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../../env.js'
import { requireSession } from '../../session.js'
import { revokeDevice } from '../../db.js'
import { dropDeviceState } from '../../bus.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'DELETE') {
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

  const id = String(req.query.id ?? '').trim()
  if (!id) {
    res.status(400).json({ error: 'invalid_device_id' })
    return
  }

  const revoked = await revokeDevice(session.userId, id)
  if (!revoked) {
    // Either the device doesn't exist or isn't this user's — same 404 either way
    // so we don't leak which.
    res.status(404).json({ error: 'device_not_found' })
    return
  }

  await dropDeviceState(id)
  res.status(200).json({ ok: true })
}
