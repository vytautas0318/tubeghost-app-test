// Shared helpers for the cross-project TubeProxies <-> TubeGhost sync
// edge functions. These functions are triggered by Supabase DATABASE
// WEBHOOKS (not the renderer), so:
//   * They authenticate with a shared SYNC_WEBHOOK_SECRET header, not a
//     user JWT (there is no user in a DB-webhook request).
//   * They write to the PEER project with that project's service-role
//     key, read from Supabase secrets — never shipped in the client.
//
// Secrets each sync function expects (set per-project, see RUNBOOK.md):
//   SYNC_WEBHOOK_SECRET        - shared secret both projects' webhooks send
//   PEER_SUPABASE_URL          - the OTHER project's URL
//   PEER_SERVICE_ROLE_KEY      - the OTHER project's service_role key
//   SELF_SUPABASE_URL          - this project's URL (for outbox writes)
//   SELF_SERVICE_ROLE_KEY      - this project's service_role key

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export interface WebhookPayload<T = Record<string, unknown>> {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: T | null
  old_record: T | null
}

// Constant-time-ish comparison of the webhook secret. Supabase sends the
// value we configure in the webhook's HTTP headers.
export function verifyWebhookSecret(req: Request): boolean {
  const expected = Deno.env.get('SYNC_WEBHOOK_SECRET')
  if (!expected) return false
  const got =
    req.headers.get('x-sync-secret') ??
    req.headers.get('X-Sync-Secret') ??
    ''
  if (got.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= got.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

export function peerClient(): SupabaseClient {
  const url = Deno.env.get('PEER_SUPABASE_URL')
  const key = Deno.env.get('PEER_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('PEER_SUPABASE_URL / PEER_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

export function selfClient(): SupabaseClient {
  const url = Deno.env.get('SELF_SUPABASE_URL')
  const key = Deno.env.get('SELF_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SELF_SUPABASE_URL / SELF_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Deterministic content hash so a webhook can no-op an echo of its own
// write. Order-independent over the provided fields.
export async function contentHash(fields: Record<string, unknown>): Promise<string> {
  const canonical = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${JSON.stringify(fields[k] ?? null)}`)
    .join('&')
  const data = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Record a failed peer write to THIS project's sync_outbox for later
// retry by the outbox-retry function. Best-effort; never throws.
//
// `rpc` is the PEER RPC to invoke on retry and `args` are its exact
// arguments — stored verbatim so outbox-retry is direction-agnostic and
// needs no per-entity dispatch table. (entity/op are metadata only.)
export async function enqueueOutbox(
  entity: string,
  entityId: string,
  op: 'upsert' | 'delete',
  rpc: string,
  args: Record<string, unknown>,
  err: unknown
): Promise<void> {
  try {
    const self = selfClient()
    await self.from('sync_outbox').insert({
      target: Deno.env.get('PEER_LABEL') ?? 'peer',
      entity,
      entity_id: entityId,
      op,
      payload: { rpc, args },
      last_error: errText(err).slice(0, 2000),
      // exponential-ish first backoff
      next_retry_at: new Date(Date.now() + 30_000).toISOString()
    })
  } catch (_e) {
    // If even the outbox write fails, the webhook will 500 and Supabase
    // will retry the whole delivery — still safe because upserts are
    // idempotent.
  }
}

// Best-effort human-readable error text. supabase-js / PostgREST errors
// are plain objects ({message, code, details}), NOT Error instances, so
// String(err) yields "[object Object]" — extract the useful fields.
export function errText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    const parts = [e.message, e.code, e.details, e.hint].filter(Boolean)
    if (parts.length) return parts.join(' | ')
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

export function ok(body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

export function deny(status = 401, msg = 'unauthorized'): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
