// Starting a phone-number purchase from inside the app.
//
// Mirrors buy-proxies/checkoutLink.ts: the Edge Function mints a one-time
// Stripe Checkout URL (STRIPE_SECRET_KEY must never ship in the bundle), and we
// open it. Fulfilment is TubeProxies' webhook — see supabase/functions/
// phone-checkout/index.ts for why a purchase made here shows up in both
// products.

import { getSupabase } from '@/lib/supabase'

export type PhoneBillingPeriod = 'monthly' | 'quarterly' | 'annual'

/**
 * A refusal the USER must see and act on — currently "you already have a phone
 * subscription", which is a decision, not a glitch. Falling back to the
 * dashboard on these would hide the reason.
 */
export class PhoneCheckoutRefused extends Error {}

/** Where to send someone whose checkout could not be started here. */
export const PHONE_DASHBOARD_URL = 'https://dash.tubeproxies.com/phone-numbers'

export async function startPhoneCheckout(
  quantity: number,
  period: PhoneBillingPeriod
): Promise<string> {
  const c = getSupabase()
  if (!c) throw new Error('Not signed in')

  const { data, error } = await c.functions.invoke<{ url?: string; error?: string }>(
    'phone-checkout',
    { body: { quantity, billing_period: period } }
  )

  // supabase-js reports any non-2xx as `error` with the body unparsed, so read
  // the server's message off the response rather than surfacing a bare
  // "non-2xx status code".
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = (await ctx.json()) as { error?: string }
        if (parsed?.error) {
          // 400 = already subscribed / quantity rejected. A decision to show.
          if (ctx.status === 400) throw new PhoneCheckoutRefused(parsed.error)
          throw new Error(parsed.error)
        }
      } catch (e) {
        if (e instanceof PhoneCheckoutRefused) throw e
      }
    }
    throw new Error(error.message)
  }

  if (!data?.url) throw new Error(data?.error ?? 'Could not start checkout')
  return data.url
}

/**
 * Open Stripe's billing portal for proxy + phone-number subscriptions.
 *
 * `scope: 'addons'` matters: those bill the buyer's own TubeProxies customer,
 * not the workspace's TubeGhost one, and the default scope would open a portal
 * showing none of the subscriptions the user came to cancel.
 */
export async function openAddonPortal(workspaceId: string | null): Promise<void> {
  const c = getSupabase()
  if (!c) throw new Error('Not signed in')
  if (!workspaceId) throw new Error('No workspace selected')

  const { data, error } = await c.functions.invoke<{ url?: string; error?: string }>(
    'billing-portal',
    { body: { workspace_id: workspaceId, scope: 'addons' } }
  )
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = (await ctx.json()) as { error?: string }
        if (parsed?.error) throw new Error(parsed.error)
      } catch (e) {
        if (e instanceof Error && e.message) throw e
      }
    }
    throw new Error(error.message)
  }
  const url = data?.url
  if (!url) throw new Error('Could not open billing management.')
  window.open(url, '_blank', 'noopener,noreferrer')
}
