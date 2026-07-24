// mirror-user — TubeProxies -> TP Browser identity mirror.
//
// DEPLOY: TubeProxies project (qkntgnepntnbnqipuavv).
// TRIGGER: Supabase database webhook on public.profiles INSERT + UPDATE
//          (TubeProxies profiles = USER accounts). See RUNBOOK.md.
//
// Effect: upserts the user into TP Browser public.users (the mirror that
// all TP Browser user-FKs now reference), then — for a brand-new user —
// bootstraps their first workspace via provision_mirrored_user(). The
// upsert is idempotent (PK = id), so webhook retries are safe.
//
// PEER_* secrets point at TP Browser here.

import {
  WebhookPayload,
  verifyWebhookSecret,
  peerClient,
  enqueueOutbox,
  ok,
  deny
} from '../_shared/sync.ts'

interface TpProfile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return deny(405, 'method not allowed')
  if (!verifyWebhookSecret(req)) return deny(401, 'bad sync secret')

  let body: WebhookPayload<TpProfile>
  try {
    body = await req.json()
  } catch {
    return deny(400, 'invalid json')
  }

  const p = body.record
  if (!p || !p.id || !p.email) return ok({ skipped: 'no record' })

  const tpb = peerClient() // TP Browser

  const row = {
    id: p.id,
    email: p.email,
    full_name: p.full_name ?? null,
    avatar_url: p.avatar_url ?? null,
    role: p.role ?? 'user',
    updated_at: new Date().toISOString()
  }

  const { error: upsertErr } = await tpb
    .from('users')
    .upsert(row, { onConflict: 'id' })

  if (upsertErr) {
    await enqueueOutbox('user', p.id, 'upsert', '__mirror_user__', row, upsertErr)
    return deny(500, `mirror upsert failed: ${upsertErr.message}`)
  }

  // Bootstrap workspace only on INSERT (new user). Idempotent RPC — safe
  // if the webhook double-delivers or an UPDATE slips through.
  if (body.type === 'INSERT') {
    const { error: provErr } = await tpb.rpc('provision_mirrored_user', {
      p_user_id: p.id,
      p_workspace_name: null
    })
    if (provErr) {
      // Non-fatal for the mirror row itself; queue for retry.
      await enqueueOutbox('user', p.id, 'upsert', '__mirror_user__', { ...row, provision: true }, provErr)
      return deny(500, `provision failed: ${provErr.message}`)
    }
  }

  return ok({ mirrored: p.id, provisioned: body.type === 'INSERT' })
})
