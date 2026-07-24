// sync-phone-number (TP Browser side) — status changes TP Browser -> TubeProxies.
//
// DEPLOY: TP Browser project (kyolnnzjhzwjnssijhlo).
// TRIGGER: database webhook on public.phone_numbers UPDATE.
//
// TubeProxies is the sole provisioner, so we NEVER create or delete a
// number here — this function only propagates a STATUS change that
// originated in TP Browser (e.g. an admin/automation acting via
// service_role) back to TubeProxies, keeping the two tables identical
// (requirement 3). Client writes are impossible (no RLS write policy),
// so in v1 this path is defensive; it becomes load-bearing the moment a
// TP Browser process is allowed to mutate a number.
//
// Loop prevention: skip rows whose sync_source is 'tubeproxies' (that
// value means TubeProxies just authored this row via its inbound push —
// re-sending would bounce). Only push when sync_source = 'tubeghost'.
//
// PEER_* secrets point at TubeProxies here.

import {
  WebhookPayload,
  verifyWebhookSecret,
  peerClient,
  enqueueOutbox,
  ok,
  deny
} from '../_shared/sync.ts'

interface TgPhone {
  id: string
  user_id: string
  phone_number: string
  status: string
  service_type: string | null
  label: string | null
  expires_at: string | null
  released_at: string | null
  sync_source: string | null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return deny(405, 'method not allowed')
  if (!verifyWebhookSecret(req)) return deny(401, 'bad sync secret')

  let body: WebhookPayload<TgPhone>
  try {
    body = await req.json()
  } catch {
    return deny(400, 'invalid json')
  }

  const ph = body.record
  if (!ph || !ph.id) return ok({ skipped: 'no record' })

  // Only propagate changes AUTHORED in TP Browser. A row last written by
  // the TubeProxies inbound push (sync_source='tubeproxies') is an echo.
  if (ph.sync_source !== 'tubeghost') {
    return ok({ skipped: 'not tubeghost-authored', id: ph.id, source: ph.sync_source })
  }

  const tp = peerClient() // TubeProxies
  const args = {
    p_id: ph.id,
    p_status: ph.status,
    p_label: ph.label,
    p_released_at: ph.released_at,
    p_expires_at: ph.expires_at,
    p_sync_source: 'tubeghost'
  }

  const { error } = await tp.rpc('sync_apply_phone_status', args)
  if (error) {
    await enqueueOutbox('phone_number', ph.id, 'upsert', 'sync_apply_phone_status', args, error)
    return deny(500, `phone status push failed: ${error.message}`)
  }

  return ok({ pushed: ph.id })
})
