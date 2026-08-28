// Starting a proxy-pack purchase.
//
// A Stripe Checkout URL (cs_live_…) is minted per purchase — one-time,
// buyer-specific and expiring — so there is no static per-plan link to open.
// The `proxies-checkout` Edge Function creates the session server-side (the
// Stripe secret must never ship in the Electron bundle) and returns its URL,
// which we open in the user's browser.
//
// Plan names are a CONTRACT with that function's PROXY_PRICE_IDS and with
// tubeproxies-dash/src/lib/plans.ts. Renaming a tier in the UI without updating
// both breaks checkout.

import { getSupabase } from '@/lib/supabase'

export type ProxyCycle = 'monthly' | 'quarterly' | 'annual'

export interface ProxyPlanStatus {
  /** True when the server is using a Stripe TEST key — no real charge. */
  test_mode?: boolean
  /** Plan name the buyer is already subscribed to, or null. */
  current_plan: string | null
  /**
   * Billing cycle of that subscription. Without it the UI cannot tell
   * Hobby-monthly from Hobby-quarterly, so it marked the Hobby card "Current
   * plan" on EVERY cycle tab and there was no way to switch term.
   * Null when unknown (older server, or no subscription).
   */
  current_cycle: ProxyCycle | null
  status: string | null
  proxy_limit: number | null
  renews_at: string | null
  /** IPs in stock. null when unknown — treat as available, don't block a sale. */
  available: number | null
}

// What the Buy proxies page needs to label each card: current plan and stock.
// Never throws — an unreadable status just renders plain "Buy now" buttons
// rather than blocking the page.
export async function getProxyPlanStatus(): Promise<ProxyPlanStatus> {
  const empty: ProxyPlanStatus = {
    test_mode: false,
    current_plan: null,
    current_cycle: null,
    status: null,
    proxy_limit: null,
    renews_at: null,
    available: null
  }
  try {
    const c = getSupabase()
    if (!c) return empty
    const { data, error } = await c.functions.invoke<ProxyPlanStatus>('proxies-checkout', {
      body: { action: 'status' }
    })
    if (error || !data) return empty
    return { ...empty, ...data }
  } catch {
    return empty
  }
}

// Fallback when a session can't be created (offline, signed out, Stripe down):
// hand off to the dashboard's plan-preselected billing page rather than
// stranding the user on a dead button.
export function checkoutUrl(planName: string, term: ProxyCycle): string {
  const q = new URLSearchParams({ plan: planName, billing: term })
  return `https://dash.tubeproxies.com/billing?${q.toString()}`
}

// A refusal the USER must see and act on (already subscribed, out of stock) —
// as opposed to a transient failure where falling back to the dashboard is the
// right move. Silently redirecting on these would hide the reason.
export class CheckoutRefused extends Error {}

export async function startProxyCheckout(planName: string, term: ProxyCycle): Promise<string> {
  const c = getSupabase()
  if (!c) throw new Error('Not signed in')
  const { data, error } = await c.functions.invoke<{ url?: string; error?: string }>(
    'proxies-checkout',
    { body: { plan: planName, cycle: term } }
  )
  // supabase-js reports any non-2xx as `error` with the body unparsed, so read
  // the server's message off the response rather than showing a bare
  // "non-2xx status code".
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = (await ctx.json()) as { error?: string }
        if (parsed?.error) {
          // 400 = already subscribed, 409 = out of stock. Both are decisions,
          // not glitches.
          if (ctx.status === 400 || ctx.status === 409) throw new CheckoutRefused(parsed.error)
          throw new Error(parsed.error)
        }
      } catch (e) {
        if (e instanceof CheckoutRefused) throw e
      }
    }
    throw new Error(error.message)
  }
  if (!data?.url) throw new Error(data?.error ?? 'Could not start checkout')
  return data.url
}
