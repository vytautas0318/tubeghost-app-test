// Real usage + plan figures for the Billing page: plan row from `plans`,
// live counts from profiles / workspace_members / proxies (count-only HEAD
// queries — no row payloads). Stripe-backed invoices/subscriptions have no
// backend yet, so those sections render empty states, not sample data.

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

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
      count('browser_profiles'),
      count('workspace_members'),
      count('proxies')
    ])
      .then(([planResp, profileCount, memberCount, proxyCount]) => {
        if (cancelled) return
        const p = planResp.data as {
          display_name?: string
          profile_limit?: number
          member_seat_limit?: number
          monthly_price_usd?: number
        } | null
        setData({
          loading: false,
          planName: p?.display_name ?? (plan ? plan[0].toUpperCase() + plan.slice(1) : '—'),
          planPrice: p?.monthly_price_usd ?? null,
          profileLimit: p?.profile_limit ?? null,
          seatLimit: p?.member_seat_limit ?? null,
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
