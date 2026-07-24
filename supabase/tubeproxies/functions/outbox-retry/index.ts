// outbox-retry — drain this project's sync_outbox to the peer project.
//
// DEPLOY: BOTH projects (same code, project-specific PEER_*/SELF_* secrets).
// TRIGGER: on a schedule — pg_cron calling this function, or an external
//          cron (see RUNBOOK.md). Also safe to invoke manually.
//
// Reads pending sync_outbox rows (resolved_at IS NULL, next_retry_at <=
// now) from SELF and replays each to PEER via the same idempotent RPCs
// the live webhooks use. Success -> mark resolved. Failure -> bump
// attempts + exponential backoff; give up (resolve with error) after
// max_attempts so the queue can't grow unbounded.
//
// Auth: requires the SYNC_WEBHOOK_SECRET header (same as the webhooks),
// so a scheduler must send it. No user JWT involved.

import {
  verifyWebhookSecret,
  peerClient,
  selfClient,
  ok,
  deny
} from '../_shared/sync.ts'

const BATCH = 50

interface OutboxRow {
  id: string
  entity: string
  entity_id: string
  op: string
  // payload = { rpc, args } stored verbatim at enqueue time.
  payload: { rpc: string; args: Record<string, unknown> }
  attempts: number
  max_attempts: number
}

// Sentinel: the user mirror is a table upsert (+ optional provision),
// not a single RPC. enqueueOutbox stores it under this rpc name.
const MIRROR_USER = '__mirror_user__'

function backoff(attempts: number): string {
  // 30s, 2m, 8m, 32m, capped ~2h
  const secs = Math.min(30 * 4 ** attempts, 7200)
  return new Date(Date.now() + secs * 1000).toISOString()
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return deny(405, 'method not allowed')
  if (!verifyWebhookSecret(req)) return deny(401, 'bad sync secret')

  const self = selfClient()
  const peer = peerClient()

  const { data: rows, error } = await self
    .from('sync_outbox')
    .select('*')
    .is('resolved_at', null)
    .lte('next_retry_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (error) return deny(500, `outbox read failed: ${error.message}`)
  if (!rows || rows.length === 0) return ok({ drained: 0 })

  let resolved = 0
  let deferred = 0
  let dead = 0

  for (const r of rows as OutboxRow[]) {
    // 'user' rows carry a mirror upsert + optional provision. The mirror
    // row itself is re-applied by re-invoking mirror-user, so for the
    // outbox we only need the peer-side data RPCs. If a user row lands
    // here it's the provision step; retry via the users upsert path.
    let applyErr: string | null = null
    const { rpc, args } = r.payload ?? { rpc: '', args: {} }

    // Isolation backstop: when this project's peer is TubeProxies, a
    // proxy entity must NEVER be replayed there. Proxy sync is one-way
    // (TubeProxies -> TP Browser). Mark such a row dead immediately.
    if ((Deno.env.get('PEER_LABEL') ?? '') === 'tubeproxies' && r.entity === 'proxy') {
      await self
        .from('sync_outbox')
        .update({
          resolved_at: new Date().toISOString(),
          last_error: 'blocked: proxies never sync to TubeProxies (isolation rule)'
        })
        .eq('id', r.id)
      dead++
      continue
    }

    if (rpc === MIRROR_USER) {
      // Re-upsert the mirror row and (best-effort) provision.
      const { error: uErr } = await peer.from('users').upsert(
        {
          id: args.id,
          email: args.email,
          full_name: args.full_name ?? null,
          avatar_url: args.avatar_url ?? null,
          role: args.role ?? 'user',
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      )
      if (uErr) applyErr = uErr.message
      else if (args.provision) {
        const { error: pErr } = await peer.rpc('provision_mirrored_user', {
          p_user_id: args.id,
          p_workspace_name: null
        })
        if (pErr) applyErr = pErr.message
      }
    } else if (rpc) {
      const { error: rErr } = await peer.rpc(rpc, args)
      if (rErr) applyErr = rErr.message
    } else {
      applyErr = 'outbox row has no rpc'
    }

    if (!applyErr) {
      await self
        .from('sync_outbox')
        .update({ resolved_at: new Date().toISOString(), last_error: null })
        .eq('id', r.id)
      resolved++
    } else {
      const nextAttempts = r.attempts + 1
      const giveUp = nextAttempts >= r.max_attempts
      await self
        .from('sync_outbox')
        .update({
          attempts: nextAttempts,
          last_error: applyErr.slice(0, 2000),
          next_retry_at: backoff(nextAttempts),
          resolved_at: giveUp ? new Date().toISOString() : null
        })
        .eq('id', r.id)
      if (giveUp) dead++
      else deferred++
    }
  }

  return ok({ processed: rows.length, resolved, deferred, dead })
})
