// Plan-change calls against the proxies-checkout edge function.
//
// Mirrors tubeproxies-dash's usePlanChange flow: PREVIEW first, show the user
// exactly what they will be charged, and only mutate after an explicit
// confirm. The dash calls /api/preview-plan-change then /api/upgrade or
// /api/downgrade; the edge function exposes the same two steps as actions on
// one function, so the app never leaves for the dashboard.
//
// Both steps classify server-side through the SAME getPlanAction, so a preview
// saying "$0 today, effective Sep 30" can never be followed by an immediate
// charge.

import { getSupabase } from '@/lib/supabase'
import type { ProxyCycle } from './checkoutLink'

export interface PlanChangePreview {
  test_mode: boolean
  kind: 'upgrade' | 'downgrade' | 'select'
  timing: 'immediate' | 'period_end' | 'none'
  isIntervalOnly: boolean
  requiresProxySelection: boolean
  currentPlan: { name: string | null; proxies: number; billingPeriod: ProxyCycle | null }
  newPlan: { name: string; proxies: number; billingPeriod: ProxyCycle }
  proxyDifference: number
  /** Set for scheduled downgrades; null when the change applies now. */
  effectiveDate: string | null
  /** Stripe's amount_due — exactly what will be charged. 0 for downgrades. */
  chargedToday: number
  subtotal: number
  tax: number
  taxPercent: number
  automaticTaxApplied: boolean
  nextBilling: { date: string | null }
}

export type PlanChangeResult =
  | {
      success: true
      scheduled: boolean
      isIntervalOnly: boolean
      effectiveDate?: string
      newPlan: string
      message: string
    }
  // The prorated invoice needs authorising (3DS/SCA): Stripe's hosted invoice
  // page collects it. Reporting success here would claim money moved when it
  // has not.
  | { success: false; requiresPayment: true; redirect_url: string; invoice_id: string }

/** A refusal the user must see and act on, as opposed to a transient failure. */
export class PlanChangeRefused extends Error {}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const c = getSupabase()
  if (!c) throw new Error('Not signed in')
  const { data, error } = await c.functions.invoke<T & { error?: string }>('proxies-checkout', {
    body
  })
  if (error) {
    // supabase-js reports any non-2xx as `error` with the body unparsed, so
    // read the server's message off the response rather than surfacing a bare
    // "non-2xx status code".
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = (await ctx.json()) as { error?: string }
        if (parsed?.error) {
          // 400/409 are decisions (already on this plan, out of stock), not
          // glitches — the user needs to read them.
          if (ctx.status === 400 || ctx.status === 409) throw new PlanChangeRefused(parsed.error)
          throw new Error(parsed.error)
        }
      } catch (e) {
        if (e instanceof PlanChangeRefused) throw e
      }
    }
    throw new Error(error.message)
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new PlanChangeRefused(String(data.error))
  }
  return data as T
}

/** Read-only. Mutates nothing — safe to call before the user commits. */
export async function previewPlanChange(
  plan: string,
  cycle: ProxyCycle
): Promise<PlanChangePreview> {
  return invoke<PlanChangePreview>({ action: 'preview-plan-change', plan, cycle })
}

/**
 * MUTATING. Only call after the user has confirmed a preview.
 *
 * `proxyIdsToRelease` is required only for a tier downgrade that sheds IPs;
 * an interval-only change keeps every proxy and sends an empty list, which is
 * what routes the webhook to its plain row-sync branch.
 */
export async function commitPlanChange(
  plan: string,
  cycle: ProxyCycle,
  proxyIdsToRelease: string[] = []
): Promise<PlanChangeResult> {
  return invoke<PlanChangeResult>({
    action: 'change-plan',
    plan,
    cycle,
    proxy_ids_to_release: proxyIdsToRelease
  })
}
