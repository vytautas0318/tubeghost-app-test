// Real usage + plan figures for Settings → Billing: the plan row from `plans`
// joined with the workspace's webhook-owned subscription state, plus live
// counts from profiles / workspace_members / proxies (count-only HEAD queries
// — no row payloads).
//
// ⚠ Plans are GRADUATED. `plans.profile_limit` and `plans.monthly_price_usd`
// are only the plan's FLOOR — a Team workspace that bought 500 profiles has
// its real cap in workspaces.purchased_profiles and its real price derived
// from the graduated bands. Reading the plan row alone would show
// "Team · 25 profiles · $40/mo" to someone paying $249, and would disagree
// with the /billing page, which this panel is meant to mirror exactly.

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { PLANS, isPlanKey, planQuote, readCycle, type PlanCycle } from '@shared/pricing'

export interface BillingData {
  loading: boolean
  planName: string
  planPrice: number | null
  profileLimit: number | null
  seatLimit: number | null
  profileCount: number
  memberCount: number
  proxyCount: number
}

/** Subscription state, webhook-owned columns on the workspace row. */
interface SubRow {
  plan_cycle: string | null
  extra_seats: number | null
  purchased_profiles: number | null
}

const INITIAL: BillingData = {
  loading: true,
  planName: '—',
  planPrice: null,
  profileLimit: null,
  seatLimit: null,
  profileCount: 0,
  memberCount: 0,
  proxyCount: 0
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
      // Subscription state: what was actually purchased.
      supabase
        .from('workspaces')
        .select('plan_cycle, extra_seats, purchased_profiles')
        .eq('id', workspaceId)
        .maybeSingle(),
      count('browser_profiles'),
      count('workspace_members'),
      count('proxies')
    ])
      .then(([planResp, subResp, profileCount, memberCount, proxyCount]) => {
        if (cancelled) return
        const p = planResp.data as {
          display_name?: string
          profile_limit?: number
          member_seat_limit?: number
          monthly_price_usd?: number
        } | null
        const sub = (subResp as { data?: SubRow | null }).data ?? null

        // Effective figures, derived exactly as useBilling does so the two
        // surfaces cannot disagree.
        const includedSeats = p?.member_seat_limit ?? null
        const purchased = sub?.purchased_profiles
        const profileLimit =
          purchased != null && purchased > 0 ? purchased : (p?.profile_limit ?? null)

        let planPrice: number | null = p?.monthly_price_usd ?? null
        if (isPlanKey(plan)) {
          const def = PLANS[plan]
          const cycle: PlanCycle = readCycle(sub?.plan_cycle)
          planPrice = planQuote(
            def,
            cycle,
            def.seatsIncluded + (sub?.extra_seats ?? 0),
            purchased ?? def.profiles
          ).monthly
        }

        setData({
          loading: false,
          planName: p?.display_name ?? (plan ? plan[0].toUpperCase() + plan.slice(1) : '—'),
          planPrice,
          profileLimit,
          // Effective cap = included + purchased, matching the DB trigger.
          seatLimit: includedSeats == null ? null : includedSeats + (sub?.extra_seats ?? 0),
          profileCount,
          memberCount,
          proxyCount
        })
      })
      .catch(() => !cancelled && setData((d) => ({ ...d, loading: false })))

    return () => {
      cancelled = true
    }
  }, [workspaceId, plan])

  return data
}
