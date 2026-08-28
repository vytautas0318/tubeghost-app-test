// Billing data layer: the plan row from `plans` joined with the workspace's
// webhook-owned subscription state (cycle / status / purchased seats / period),
// plus usage counted LIVE from the workspace's own records (profiles /
// workspace_members / proxies / phone numbers) via count-only HEAD queries —
// never a cached blob, because the card states "Usage counted live from this
// workspace."
//
// Plans are GRADUATED: Team's price follows the PURCHASED profile capacity,
// so it is recomputed through the shared pricing module rather than read from
// the plan row's floor price.
//
// Each section loads independently so a failure in one renders an error on
// that card alone. The card and invoices come from Stripe via `billing-info`;
// the subscription columns are service_role-only, written solely by the
// `billing-webhook` Edge Function.

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { getPhoneOverview } from '@/lib/phoneNumbers'
import { useAuth } from '@/store/auth'
import { useWorkspace } from '@/store/workspace'
import { useStripeInfo } from './useStripeInfo'
import { readCycle } from '@shared/pricing'
import { derivePrice, deriveProfileLimit, type PlanRow, type SubRow } from './planDerive'
import type {
  BillingPlan,
  BillingState,
  BillingUsage,
  Invoice,
  PaymentMethod,
  PlanStatus,
  Section
} from './types'

const EMPTY_USAGE: BillingUsage = {
  profilesUsed: 0,
  profileLimit: null,
  seatsUsed: 0,
  seatLimit: null,
  proxiesInPool: 0,
  phoneNumbers: 0
}

function section<T>(data: T): Section<T> {
  return { data, loading: true, error: null }
}

export function useBilling(): BillingState {
  const email = useAuth((s) => s.user?.email) ?? ''
  const [plan, setPlan] = useState<Section<BillingPlan | null>>(section(null))
  const [usage, setUsage] = useState<Section<BillingUsage>>(section(EMPTY_USAGE))
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  // Selected narrowly so the hook only re-runs on a workspace/plan change.
  const workspaceId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const planKey = useWorkspace((s) => s.current?.plan ?? null)

  // Card + invoices, from Stripe. Shared with Settings → Billing so the two
  // surfaces can never show different cards.
  const stripe = useStripeInfo(workspaceId)

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false

    const supabase = getSupabase()
    if (!supabase) {
      // Reported asynchronously so the effect body never sets state
      // synchronously (react-hooks/set-state-in-effect).
      queueMicrotask(() => {
        if (cancelled) return
        const msg = 'Supabase not configured'
        setPlan((p) => ({ ...p, loading: false, error: msg }))
        setUsage((u) => ({ ...u, loading: false, error: msg }))
      })
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => {
      if (cancelled) return
      setPlan((p) => ({ ...p, loading: true, error: null }))
      setUsage((u) => ({ ...u, loading: true, error: null }))
    })

    const count = async (table: string): Promise<number> => {
      const { count: c, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
      if (error) throw new Error(error.message)
      return c ?? 0
    }

    // ── plan + subscription state ─────────────────────────────────────
    const planQuery = planKey
      ? supabase
          .from('plans')
          .select('plan_key, display_name, profile_limit, member_seat_limit, monthly_price_usd')
          .eq('plan_key', planKey)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })

    // Cycle/status/seats are webhook-owned columns on the workspace itself.
    const subQuery = supabase
      .from('workspaces')
      .select(
        'plan_cycle, plan_status, extra_seats, purchased_profiles, ' +
          'current_period_end, cancel_at_period_end'
      )
      .eq('id', workspaceId)
      .maybeSingle()

    void Promise.all([Promise.resolve(planQuery), subQuery])
      .then(([planRes, subRes]) => {
        if (cancelled) return
        if (planRes.error) throw new Error(planRes.error.message)
        if (subRes.error) throw new Error(subRes.error.message)
        const row = planRes.data as PlanRow | null
        const sub = subRes.data as SubRow | null
        const fallbackName = planKey ? planKey[0].toUpperCase() + planKey.slice(1) : '—'
        const includedSeats = row?.member_seat_limit ?? null
        setPlan({
          loading: false,
          error: null,
          data: {
            id: row?.plan_key ?? planKey ?? 'free',
            name: row?.display_name ?? fallbackName,
            // Effective cap = included + purchased, matching the DB trigger.
            seats: includedSeats == null ? null : includedSeats + (sub?.extra_seats ?? 0),
            seatsIncluded: includedSeats,
            extraSeats: sub?.extra_seats ?? 0,
            profileLimit: deriveProfileLimit(row, sub),
            priceMonthly: derivePrice(row, sub),
            cycle: readCycle(sub?.plan_cycle),
            status: (sub?.plan_status ?? 'active') as PlanStatus,
            currentPeriodEnd: sub?.current_period_end ?? null,
            cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false
          }
        })
      })
      .catch((e: Error) => {
        if (!cancelled) setPlan((p) => ({ ...p, loading: false, error: e.message }))
      })

    // ── usage (live counts) ───────────────────────────────────────────
    //
    // allSettled, not all: each meter is independent, so one count failing —
    // an RLS-filtered proxies read for a restricted member, say — must not
    // discard the profile and seat numbers that did resolve. Those two are the
    // point of this card. A failed count renders null ("—") rather than 0, so
    // we never state a confident wrong number.
    void Promise.allSettled([
      count('browser_profiles'),
      count('workspace_members'),
      count('proxies'),
      // Phone numbers are TubeProxies-owned (public.phone_numbers) and read
      // through the `phone-numbers` Edge Function — the same source the Phone
      // page uses, so the two cannot disagree. A count() here would hit
      // ghost.user_phone_numbers, which no longer holds anything.
      getPhoneOverview().then((o) => o.phone_numbers.length)
    ])
      .then(([profiles, seats, proxies, phones]) => {
        if (cancelled) return
        const value = (r: PromiseSettledResult<number>): number | null =>
          r.status === 'fulfilled' ? r.value : null
        // Only a total wipeout is worth erroring the card.
        const allFailed = [profiles, seats, proxies].every((r) => r.status === 'rejected')
        setUsage((u) => ({
          loading: false,
          error: allFailed ? 'Could not count workspace usage.' : null,
          data: {
            ...u.data,
            profilesUsed: value(profiles),
            seatsUsed: value(seats),
            proxiesInPool: value(proxies),
            // A missing phone subscription is normal, not a failure — 0, not "—".
            phoneNumbers: value(phones) ?? 0
          }
        }))
      })
      .catch((e: Error) => {
        if (!cancelled) setUsage((u) => ({ ...u, loading: false, error: e.message }))
      })

    return () => {
      cancelled = true
    }
  }, [workspaceId, planKey, nonce])

  // Mirror the plan's caps onto the usage card so meters have denominators.
  const usageWithLimits: Section<BillingUsage> = {
    ...usage,
    data: {
      ...usage.data,
      profileLimit: plan.data?.profileLimit ?? null,
      seatLimit: plan.data?.seats ?? null
    }
  }

  const paymentMethod: Section<PaymentMethod | null> = {
    data: stripe.paymentMethod,
    loading: stripe.loading,
    error: stripe.error
  }
  const invoices: Section<Invoice[]> = {
    data: stripe.invoices,
    loading: stripe.loading,
    error: stripe.error
  }

  return { plan, usage: usageWithLimits, paymentMethod, billingEmail: email, invoices, refresh }
}
