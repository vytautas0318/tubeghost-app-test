// Real usage + entitlement figures for the Billing page.
//
// The limits shown here MUST match what the DB actually enforces, which is
// what ghost.workspace_profile_limit() / ghost.workspace_seat_limit()
// compute — not the bare ghost.plans row:
//
//   profiles = greatest(workspaces.purchased_profiles, plans.profile_limit)
//   seats    = plans.member_seat_limit + workspaces.extra_seats
//
// Reading plans alone showed a customer who had bought 400 profiles their
// plan's default 25, which is the bug this hook previously had.

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import {
  applyCycle,
  billedTotal,
  pfPrice,
  readCycle,
  SEAT_RATE,
  STARTER_BASE
} from '@shared/pricing'

export interface BillingData {
  loading: boolean
  planName: string
  /**
   * EFFECTIVE monthly price — what the customer actually pays per month
   * after the cycle discount. This is the headline figure; showing the list
   * price to someone on annual overstates their cost by ~17%.
   */
  planPrice: number | null
  /** Undiscounted monthly price. Equals planPrice on a monthly cycle. */
  planListPrice: number | null
  /** Total charged per billing event: 12× on annual, 3× on quarterly, 0 monthly. */
  billedTotal: number
  profileLimit: number | null
  seatLimit: number | null
  profileCount: number
  memberCount: number
  proxyCount: number
  /** Billing cycle from the subscription — null when on a free plan. */
  cycle: string | null
  /** True once a paid subscription backs this workspace. */
  subscribed: boolean
}

const INITIAL: BillingData = {
  loading: true,
  planName: '—',
  planPrice: null,
  planListPrice: null,
  billedTotal: 0,
  profileLimit: null,
  seatLimit: null,
  profileCount: 0,
  memberCount: 0,
  proxyCount: 0,
  cycle: null,
  subscribed: false
}

/**
 * Monthly LIST price — before any billing-cycle discount.
 *
 * A configured Team plan has no single price in ghost.plans — it is priced by
 * the graduated profile bands plus billable seats, so recompute it from the
 * shared module. Falls back to the plan row for fixed plans (free/starter).
 */
function derivePrice(
  plan: string | null,
  planPrice: number | null,
  purchasedProfiles: number | null,
  extraSeats: number
): number | null {
  if (plan === 'team' && purchasedProfiles != null) {
    return pfPrice(purchasedProfiles) + extraSeats * SEAT_RATE
  }
  if (plan === 'starter') return STARTER_BASE
  return planPrice
}

export function useBillingData(workspaceId: string | null, plan: string | null): BillingData {
  const [data, setData] = useState<BillingData>(INITIAL)

  useEffect(() => {
    if (!workspaceId) return
    const supabase = getSupabase()
    if (!supabase) return
    let cancelled = false

    const count = (table: string): PromiseLike<number> =>
      supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .then((r) => r.count ?? 0)

    Promise.all([
      plan
        ? supabase
            .from('plans')
            .select('display_name, profile_limit, member_seat_limit, monthly_price_usd')
            .eq('plan_key', plan)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      count('browser_profiles'),
      count('workspace_members'),
      count('proxies'),
      // What this workspace actually bought. Without it the page shows the
      // plan's defaults to a customer who has paid for more.
      supabase
        .from('workspaces')
        .select('purchased_profiles, extra_seats, plan_cycle, stripe_subscription_id')
        .eq('id', workspaceId)
        .maybeSingle()
    ])
      .then(([planResp, profileCount, memberCount, proxyCount, wsResp]) => {
        if (cancelled) return
        const p = planResp.data as {
          display_name?: string
          profile_limit?: number
          member_seat_limit?: number
          monthly_price_usd?: number
        } | null
        const w = wsResp.data as {
          purchased_profiles?: number | null
          extra_seats?: number | null
          plan_cycle?: string | null
          stripe_subscription_id?: string | null
        } | null

        // Mirrors the DB's own limit helpers exactly — profiles OVERRIDE the
        // plan's number, seats ADD to it.
        const planProfiles = p?.profile_limit ?? null
        const purchased = w?.purchased_profiles ?? null
        const profileLimit =
          purchased != null || planProfiles != null
            ? Math.max(purchased ?? 0, planProfiles ?? 0)
            : null

        const planSeats = p?.member_seat_limit ?? null
        const seatLimit = planSeats != null ? planSeats + (w?.extra_seats ?? 0) : null

        const listPrice = derivePrice(
          plan,
          p?.monthly_price_usd ?? null,
          purchased,
          w?.extra_seats ?? 0
        )
        const cycle = readCycle(w?.plan_cycle)

        setData({
          loading: false,
          planName: p?.display_name ?? (plan ? plan[0].toUpperCase() + plan.slice(1) : '—'),
          // plans.monthly_price_usd is only meaningful for fixed plans. A
          // configured Team subscription is priced by its quantities, so
          // derive it the same way the pricing page does, then apply the
          // cycle discount — an annual customer pays 10/12 of the list price.
          // Stripe remains the authority on what is actually charged; this is
          // display only.
          planPrice: listPrice != null ? applyCycle(listPrice, cycle) : null,
          planListPrice: listPrice,
          billedTotal:
            listPrice != null ? billedTotal(applyCycle(listPrice, cycle), cycle) : 0,
          profileLimit,
          seatLimit,
          profileCount,
          memberCount,
          proxyCount,
          cycle: w?.plan_cycle ?? null,
          subscribed: Boolean(w?.stripe_subscription_id)
        })
      })
      .catch(() => !cancelled && setData((d) => ({ ...d, loading: false })))

    return () => {
      cancelled = true
    }
  }, [workspaceId, plan])

  return data
}
