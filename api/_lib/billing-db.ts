// Service-role PostgREST access for billing state.
//
<<<<<<< HEAD
// SCHEMA: `workspaces` and `browser_profiles` live in the `ghost` schema of
// the shared TubeProxies project since the DB consolidation — NOT in
// `public`, which holds TubeProxies' own tables (public.profiles is their
// user-accounts table, not TubeGhost's browser profiles). PostgREST selects
// the schema by header, not by path prefix, so every request here must carry
// the ghost profile headers or it silently resolves against public.
//
// Service-role bypasses RLS, so every function takes an explicit owner or
// subscription id and filters by it. The quota columns are additionally
// guarded by triggers (20260810_ghost_profile_quota_billing.sql) that reject
// writes from any role other than service_role — so this file is the ONLY
// path that can set them.

import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from './env.js'

// PostgREST reads `Accept-Profile` on GET/HEAD and `Content-Profile` on
// POST/PATCH/PUT/DELETE. Sending both on every request is correct — the
// irrelevant one is ignored — and means no call site has to remember which.
const GHOST_SCHEMA_HEADERS = {
  'Accept-Profile': 'ghost',
  'Content-Profile': 'ghost'
} as const

=======
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

>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
<<<<<<< HEAD
      ...GHOST_SCHEMA_HEADERS,
=======
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
      ...(init.headers ?? {})
    }
  })
}

<<<<<<< HEAD
// Billing state columns that ghost.workspaces ALREADY has — no migration
// needed. The limit helpers read them directly:
//
//   ghost.workspace_profile_limit = greatest(purchased_profiles, plan limit)
//   ghost.workspace_seat_limit    = plan seat limit + extra_seats
//
// Note the two differ deliberately: profiles OVERRIDE the plan's number,
// seats ADD to it. So `extra_seats` must be the seats bought ABOVE the
// plan's allowance, never the total.
//
// All of these are write-protected by ghost.block_billing_column_updates
// (and zeroed on insert by pin_billing_columns_on_insert), which allows
// only service_role — this file — to set them.
=======
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
export interface WorkspaceBillingRow {
  id: string
  owner_id: string
  plan: string | null
<<<<<<< HEAD
  plan_status: string | null
  purchased_profiles: number | null
  extra_seats: number | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

const COLS =
  'id,owner_id,plan,plan_status,purchased_profiles,extra_seats,' +
  'stripe_customer_id,stripe_subscription_id'
=======
  profile_quota: number | null
  seat_quota: number | null
  tubeghost_subscription_id: string | null
  tubeghost_plan_key: string | null
}

const COLS =
  'id,owner_id,plan,profile_quota,seat_quota,tubeghost_subscription_id,tubeghost_plan_key'
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f

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
<<<<<<< HEAD
    `/workspaces?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}` +
=======
    `/workspaces?tubeghost_subscription_id=eq.${encodeURIComponent(subscriptionId)}` +
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
      `&select=${COLS}&limit=1`
  )
  if (!res.ok) return null
  const rows = (await res.json()) as WorkspaceBillingRow[]
  return rows[0] ?? null
}

/**
<<<<<<< HEAD
 * Apply the subscription state a payment grants.
 *
 * Called only from the webhook — every column here is rejected for any other
 * role by ghost.block_billing_column_updates.
 *
 * `purchasedProfiles: null` + `extraSeats: 0` clears a paid allowance on
 * cancellation, dropping the workspace back to its plan's own limits. The
 * asymmetry (null vs 0) mirrors the helpers: profiles use
 * greatest(purchased, plan) so null means "no override", while seats use
 * plan + extra so 0 means "no extras".
 */
export async function setWorkspaceSubscription(
  workspaceId: string,
  patch: {
    plan: string
    planCycle?: string
    planStatus: string
    purchasedProfiles: number | null
    extraSeats: number
    stripeCustomerId?: string | null
    stripeSubscriptionId: string | null
    currentPeriodEnd?: string | null
    cancelAtPeriodEnd?: boolean
  }
): Promise<boolean> {
  const body: Record<string, unknown> = {
    plan: patch.plan,
    plan_status: patch.planStatus,
    purchased_profiles: patch.purchasedProfiles,
    extra_seats: patch.extraSeats,
    stripe_subscription_id: patch.stripeSubscriptionId
  }
  if (patch.planCycle !== undefined) body.plan_cycle = patch.planCycle
  if (patch.stripeCustomerId !== undefined) body.stripe_customer_id = patch.stripeCustomerId
  if (patch.currentPeriodEnd !== undefined) body.current_period_end = patch.currentPeriodEnd
  if (patch.cancelAtPeriodEnd !== undefined) body.cancel_at_period_end = patch.cancelAtPeriodEnd
=======
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
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f

  const res = await rest(`/workspaces?id=eq.${encodeURIComponent(workspaceId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  })
  return res.ok
}

<<<<<<< HEAD
/**
 * Current profile count — to warn before a downgrade strands profiles.
 *
 * `browser_profiles`, NOT `profiles`: in the shared project `public.profiles`
 * is TubeProxies' user-accounts table, and TubeGhost's browser profiles are
 * ghost.browser_profiles. Querying the wrong one would count strangers.
 */
export async function countProfiles(workspaceId: string): Promise<number> {
  const res = await rest(
    `/browser_profiles?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id`,
=======
/** Current profile count — to warn before a downgrade strands profiles. */
export async function countProfiles(workspaceId: string): Promise<number> {
  const res = await rest(
    `/profiles?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id`,
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
    { headers: { Prefer: 'count=exact', Range: '0-0' } }
  )
  if (!res.ok) return 0
  const range = res.headers.get('content-range') ?? ''
  const total = Number(range.split('/')[1])
  return Number.isFinite(total) ? total : 0
}
