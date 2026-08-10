// Real subscription rows for the Billing page's Proxies / Phone tabs.
//
// Both tables are TubeProxies-owned and live in the `public` schema of the
// shared project. Each has a "Users read own …" RLS policy, so the signed-in
// user's own rows come back without any service-role hop — and someone
// else's never do.
//
// Read-only by design: inserts and updates are denied to users at the policy
// level (only the Stripe webhook writes them), which is why every management
// action on these tabs hands off to Stripe's billing portal.

import { useEffect, useState } from 'react'
import { getPublicSchema } from '@/lib/supabase'

export interface ProxySubRow {
  id: string
  stripe_subscription_id: string
  status: string
  plan_name: string
  proxy_limit: number
  current_period_end: string | null
  cancel_at_period_end: boolean | null
}

export interface PhoneSubRow {
  id: string
  stripe_subscription_id: string
  status: string
  number_quantity: number
  current_period_end: string | null
  cancel_at_period_end: boolean | null
}

export interface SubscriptionData {
  loading: boolean
  proxy: ProxySubRow | null
  phone: PhoneSubRow | null
}

const INITIAL: SubscriptionData = { loading: true, proxy: null, phone: null }

/**
 * The caller's proxy + phone subscriptions.
 *
 * Both are keyed by TubeProxies' user id, which is the same auth user as
 * ours (shared project) — no workspace filter, because these subscriptions
 * belong to the person, not the workspace.
 *
 * Statuses are filtered to the ones that still represent a live commitment;
 * a fully canceled subscription shouldn't render as an active add-on.
 */
export function useSubscriptions(userId: string | null): SubscriptionData {
  const [data, setData] = useState<SubscriptionData>(INITIAL)

  useEffect(() => {
    // No user (or no client) means nothing to fetch. Returning early leaves
    // `data` at its initial value; the derived result below reports
    // loading:false for that case rather than setting state here, which
    // would cost an extra render pass.
    if (!userId) return
    const schema = getPublicSchema()
    if (!schema) return
    let cancelled = false

    const LIVE = ['active', 'past_due', 'trialing']

    Promise.all([
      schema
        .from('subscriptions')
        .select(
          'id,stripe_subscription_id,status,plan_name,proxy_limit,current_period_end,cancel_at_period_end'
        )
        .eq('user_id', userId)
        .in('status', LIVE)
        .maybeSingle(),
      schema
        .from('phone_subscriptions')
        .select(
          'id,stripe_subscription_id,status,number_quantity,current_period_end,cancel_at_period_end'
        )
        .eq('user_id', userId)
        .in('status', LIVE)
        .maybeSingle()
    ])
      .then(([proxyResp, phoneResp]) => {
        if (cancelled) return
        setData({
          loading: false,
          proxy: (proxyResp.data as ProxySubRow | null) ?? null,
          phone: (phoneResp.data as PhoneSubRow | null) ?? null
        })
      })
      .catch(() => {
        // A read failure must not imply "no subscription" in a way that
        // hides a real one — but there's nothing truthful to show either,
        // so fall back to the empty state and let the portal be the
        // source of truth.
        if (!cancelled) setData({ loading: false, proxy: null, phone: null })
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  // Signed out: never report "loading", or the tabs would sit on a spinner
  // message forever for a user who has nothing to load.
  if (!userId) return { loading: false, proxy: null, phone: null }
  return data
}
