// sync-phone-number (TubeProxies side) — phone_numbers TP -> TP Browser.
//
// DEPLOY: TubeProxies project (qkntgnepntnbnqipuavv).
// TRIGGER: database webhook on public.phone_numbers INSERT + UPDATE.
//
// TubeProxies is the SOLE provisioner (decision #2): numbers are created
// here and mirrored one-way to TP Browser; later status changes
// (release, expiry, rotation) also propagate here. The shared uuid PK +
// sync_source make the peer's inbound handler able to no-op our echo.
//
// Loop prevention: if THIS row was last authored by the peer (its own
// status push came back to us as sync_source='tubeghost' and we already
// stored it), we skip re-pushing. We push only when the effective author
// is TubeProxies OR the content actually changed. The content guard in
// the peer RPC (sync_upsert_phone_number) is the backstop.
//
// PEER_* secrets point at TP Browser here.

import {
  WebhookPayload,
  verifyWebhookSecret,
  peerClient,
  enqueueOutbox,
  contentHash,
  ok,
  deny
} from '../_shared/sync.ts'

interface TpPhone {
  id: string
  user_id: string
  phone_number: string
  status: string
  service_type: string | null
  label: string | null
  provisioned_at: string | null
  expires_at: string | null
  released_at: string | null
  sync_source: string | null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return deny(405, 'method not allowed')
  if (!verifyWebhookSecret(req)) return deny(401, 'bad sync secret')

  let body: WebhookPayload<TpPhone>
  try {
    body = await req.json()
  } catch {
    return deny(400, 'invalid json')
  }

  const ph = body.record
  if (!ph || !ph.id || !ph.user_id) return ok({ skipped: 'no record' })

  // Echo guard: this write was applied BY the inbound peer sync (peer
  // pushed a status change, our own webhook fired on the resulting row).
  // If sync_source says 'tubeghost' and nothing else changed vs old, skip.
  if (ph.sync_source === 'tubeghost' && body.type === 'UPDATE' && body.old_record) {
    const before = await contentHash({
      status: body.old_record.status,
      phone_number: body.old_record.phone_number,
      label: body.old_record.label,
      expires_at: body.old_record.expires_at,
      released_at: body.old_record.released_at
    })
    const after = await contentHash({
      status: ph.status,
      phone_number: ph.phone_number,
      label: ph.label,
      expires_at: ph.expires_at,
      released_at: ph.released_at
    })
    if (before === after) return ok({ skipped: 'echo of peer write', id: ph.id })
  }

  const tpb = peerClient()
  const args = {
    p_id: ph.id,
    p_user_id: ph.user_id,
    p_phone_number: ph.phone_number,
    p_status: ph.status,
    p_service_type: ph.service_type,
    p_label: ph.label,
    p_provisioned_at: ph.provisioned_at,
    p_expires_at: ph.expires_at,
    p_released_at: ph.released_at,
    p_sync_source: 'tubeproxies' // WE are the author of this push
  }

  const { data, error } = await tpb.rpc('sync_upsert_phone_number', args)
  if (error) {
    await enqueueOutbox('phone_number', ph.id, 'upsert', 'sync_upsert_phone_number', args, error)
    return deny(500, `phone sync failed: ${error.message}`)
  }

  return ok({ synced: ph.id, tp_browser: data })
})
