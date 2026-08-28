// Billing hand-offs to Stripe: start a checkout, open the customer portal,
// and read back the card + invoices.
//
// `startUpgrade` calls `billing-checkout`, which recomputes the quote
// server-side and returns a Stripe Checkout URL. The client-computed prices
// below are DISPLAY ONLY — they travel as `quoted_charged` purely so the
// server can detect drift and refuse, never as the amount charged.
//
// Nothing here changes the plan. `workspaces.plan` and the stripe_* columns
// are write-protected by DB triggers and only the `billing-webhook` function
// (service_role) may write them, so the plan flips after Stripe confirms.

import { getSupabase } from '@/lib/supabase'
import type { PlanCycle } from '@shared/pricing'
import type { Invoice, PaymentMethod } from './types'

export interface BillingInfo {
  paymentMethod: PaymentMethod | null
  invoices: Invoice[]
}

/**
 * supabase-js THROWS on any non-2xx, so `data` is null and the top-level
 * message is the generic "Edge Function returned a non-2xx status code". The
 * real reason — "Delete 240 profiles to fit this plan", "You do not have
 * permission" — is the JSON body hanging off error.context. Without this the
 * user hits a dead end on every refusal. Mirrors readableInvokeError in
 * lib/assistant.ts.
 */
async function readableInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const parsed = (await ctx.clone().json()) as { error?: string }
      if (parsed?.error) return parsed.error
    } catch {
      /* body not JSON — fall through */
    }
  }
  const msg = (error as { message?: string })?.message ?? ''
  if (/failed to fetch|network/i.test(msg)) {
    return 'Could not reach the billing service. Check your connection.'
  }
  return msg || 'Could not start checkout.'
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotImplemented'
  }
}

export interface UpgradePayload {
  workspaceId: string
  /** Target plan_key — 'starter' or 'team'. */
  planId: string
  cycle: PlanCycle
  /** Total members to seat, including those bundled in the price. */
  members: number
  /** Profile capacity to buy. Only meaningful on Team (the configurator). */
  profiles: number
  /**
   * Client-computed amount for this billing event, for drift detection only.
   * The server recomputes from its own catalogue; a mismatch fails checkout
   * rather than charging either number.
   */
  quotedCharged: number
}

export const billingApi = {
  /**
   * Hands the configured plan off to Stripe Checkout and opens the hosted
   * page in the user's browser.
   * @throws Error with a user-presentable message on failure.
   */
  async startUpgrade(payload: UpgradePayload): Promise<void> {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Not connected. Please sign in again.')
    if (!payload.workspaceId) throw new Error('No workspace selected.')

    const { data, error } = await supabase.functions.invoke('billing-checkout', {
      body: {
        workspace_id: payload.workspaceId,
        plan: payload.planId,
        cycle: payload.cycle,
        members: payload.members,
        profiles: payload.profiles,
        quoted_charged: payload.quotedCharged
      }
    })

    if (error) throw new Error(await readableInvokeError(error))

    const url = (data as { url?: string } | null)?.url
    if (!url) throw new Error('Checkout did not return a payment link.')

    // Hosted Checkout must open in the real browser, not an app window —
    // card autofill and 3-D Secure both depend on it.
    window.open(url, '_blank', 'noopener,noreferrer')
  },

  /**
   * Opens the Stripe Customer Portal: update or remove the card, download
   * invoices, cancel the subscription — all in one hosted session.
   *
   * The URL is a short-lived single-use BEARER link, so it is minted on the
   * click and opened immediately. Never cache or store it.
   *
   * @throws Error with a user-presentable message on failure.
   */
  async openPortal(workspaceId: string | null): Promise<void> {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Not connected. Please sign in again.')
    if (!workspaceId) throw new Error('No workspace selected.')

    const { data, error } = await supabase.functions.invoke('billing-portal', {
      body: { workspace_id: workspaceId }
    })
    if (error) throw new Error(await readableInvokeError(error))

    const url = (data as { url?: string } | null)?.url
    if (!url) throw new Error('Could not open billing management.')
    window.open(url, '_blank', 'noopener,noreferrer')
  },

  /** Card on file + recent invoices. Returns empty data, never throws on 404. */
  async fetchInfo(workspaceId: string | null): Promise<BillingInfo> {
    const supabase = getSupabase()
    if (!supabase || !workspaceId) return { paymentMethod: null, invoices: [] }

    const { data, error } = await supabase.functions.invoke('billing-info', {
      body: { workspace_id: workspaceId }
    })
    if (error) throw new Error(await readableInvokeError(error))

    const res = (data ?? {}) as {
      payment_method?: {
        brand: string
        last4: string
        exp_month: number
        exp_year: number
      } | null
      invoices?: {
        id: string
        number: string | null
        date: string
        amount: number
        currency: string
        status: string
        pdf_url: string | null
      }[]
    }

    return {
      paymentMethod: res.payment_method
        ? {
            brand: res.payment_method.brand,
            last4: res.payment_method.last4,
            expMonth: res.payment_method.exp_month,
            expYear: res.payment_method.exp_year
          }
        : null,
      invoices: (res.invoices ?? []).map((i) => ({
        id: i.id,
        date: i.date,
        description: i.number ? `Invoice ${i.number}` : 'Invoice',
        amount: i.amount,
        status: i.status as Invoice['status'],
        downloadUrl: i.pdf_url
      }))
    }
  }
}
