// Service-role PostgREST access for billing state.
//
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

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...GHOST_SCHEMA_HEADERS,
      ...(init.headers ?? {})
    }
  })
}

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
export interface WorkspaceBillingRow {
  id: string
  owner_id: string
  plan: string | null
  plan_status: string | null
  purchased_profiles: number | null
  extra_seats: number | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

const COLS =
  'id,owner_id,plan,plan_status,purchased_profiles,extra_seats,' +
  'stripe_customer_id,stripe_subscription_id'

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
    `/workspaces?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}` +
      `&select=${COLS}&limit=1`
  )
  if (!res.ok) return null
  const rows = (await res.json()) as WorkspaceBillingRow[]
  return rows[0] ?? null
}

/**
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

  const res = await rest(`/workspaces?id=eq.${encodeURIComponent(workspaceId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  })
  return res.ok
}

/**
 * Unassigned proxies TubeProxies can hand out right now.
 *
 * Calls THEIR SECURITY DEFINER RPC rather than reading proxy_inventory
 * directly, so the count follows whatever rules they apply to availability.
 *
 * Returns null (not 0) when the lookup fails — callers must treat that as
 * "unknown" and let the purchase proceed. Reporting 0 on a network blip would
 * tell customers we are sold out when we are not.
 */
export async function countAvailableInventory(): Promise<number | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_available_inventory_count`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    })
    if (!res.ok) return null
    const n = (await res.json()) as unknown
    return typeof n === 'number' ? n : null
  } catch {
    return null
  }
}

/**
 * Active proxies this user already holds on TubeProxies.
 *
 * public.proxies is THEIR table, so this request must NOT carry the ghost
 * schema headers the rest of this file uses.
 *
 * Needed because assign_proxies_immediately() assigns
 * `greatest(0, subscription.proxy_limit - active_count)` — a bundle at or
 * below what they already hold assigns nothing while still charging them.
 *
 * Returns 0 on any failure so a lookup problem never blocks a sale; the
 * worst case is the pre-existing behaviour.
 */
export async function countActiveProxies(userId: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/proxies` +
      `?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=id`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
        Range: '0-0'
      }
    }
  )
  if (!res.ok) return 0
  const total = Number((res.headers.get('content-range') ?? '').split('/')[1])
  return Number.isFinite(total) ? total : 0
}

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
    { headers: { Prefer: 'count=exact', Range: '0-0' } }
  )
  if (!res.ok) return 0
  const range = res.headers.get('content-range') ?? ''
  const total = Number(range.split('/')[1])
  return Number.isFinite(total) ? total : 0
}
