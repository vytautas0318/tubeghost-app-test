// Service-role PostgREST access for billing state.
//
// Separate from _lib/db.ts because that helper pins the `ghost` schema (the
// devices/MCP tables), whereas `workspaces` lives in `public` — the default
// schema — since the DB consolidation. Sending `ghost` headers here would
// 404 on a table that exists.
//
// Service-role bypasses RLS, so every function takes an explicit owner or
// subscription id and filters by it. The quota columns are additionally
// guarded by the 0044 triggers, which reject writes from any role other than
// service_role — so this file is the ONLY path that can set them.

import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from './env.js'

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  })
}

export interface WorkspaceBillingRow {
  id: string
  owner_id: string
  plan: string | null
  profile_quota: number | null
  seat_quota: number | null
  tubeghost_subscription_id: string | null
  tubeghost_plan_key: string | null
}

const COLS =
  'id,owner_id,plan,profile_quota,seat_quota,tubeghost_subscription_id,tubeghost_plan_key'

/** Load a workspace by id — used to verify the caller owns it. */
export async function getWorkspace(id: string): Promise<WorkspaceBillingRow | null> {
  const res = await rest(`/workspaces?id=eq.${encodeURIComponent(id)}&select=${COLS}&limit=1`)
  if (!res.ok) return null
  const rows = (await res.json()) as WorkspaceBillingRow[]
  return rows[0] ?? null
}

/** Find the workspace a Stripe subscription is attached to. */
export async function getWorkspaceBySubscription(
  subscriptionId: string
): Promise<WorkspaceBillingRow | null> {
  const res = await rest(
    `/workspaces?tubeghost_subscription_id=eq.${encodeURIComponent(subscriptionId)}` +
      `&select=${COLS}&limit=1`
  )
  if (!res.ok) return null
  const rows = (await res.json()) as WorkspaceBillingRow[]
  return rows[0] ?? null
}

/**
 * Apply the quota a subscription grants.
 *
 * Called only from the webhook. Passing `profileQuota: null` clears the quota
 * (on cancellation), dropping the workspace back to its plan-table limit
 * rather than leaving a paid allowance in place.
 */
export async function setWorkspaceQuota(
  workspaceId: string,
  patch: {
    profileQuota: number | null
    seatQuota: number | null
    subscriptionId: string | null
    planKey: string | null
    plan?: string
  }
): Promise<boolean> {
  const body: Record<string, unknown> = {
    profile_quota: patch.profileQuota,
    seat_quota: patch.seatQuota,
    tubeghost_subscription_id: patch.subscriptionId,
    tubeghost_plan_key: patch.planKey
  }
  // `plan` is guarded by the pre-existing billing trigger, which also allows
  // service_role. Only set it when the caller explicitly asks.
  if (patch.plan !== undefined) body.plan = patch.plan

  const res = await rest(`/workspaces?id=eq.${encodeURIComponent(workspaceId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  })
  return res.ok
}

/** Current profile count — to warn before a downgrade strands profiles. */
export async function countProfiles(workspaceId: string): Promise<number> {
  const res = await rest(
    `/profiles?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id`,
    { headers: { Prefer: 'count=exact', Range: '0-0' } }
  )
  if (!res.ok) return 0
  const range = res.headers.get('content-range') ?? ''
  const total = Number(range.split('/')[1])
  return Number.isFinite(total) ? total : 0
}
