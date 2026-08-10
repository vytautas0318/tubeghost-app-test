// Deep links into the TubeProxies dashboard's Stripe checkout.
//
// Commerce for proxies and phone numbers lives on TubeProxies — those
// products are priced and provisioned there, and its Stripe webhook
// allocates the actual IPs/numbers into the shared database. We never
// reimplement that here; we hand the user off mid-flow.
//
// Both products share one Supabase project, so the dashboard resolves the
// signed-in user itself. If the browser session doesn't carry over, the
// dashboard bounces to its own login and returns to checkout after.

const DASH = 'https://dash.tubeproxies.com'

/**
 * Proxy plan names as the dashboard's checkout expects them. It matches on
 * `plan.name` exactly (src/lib/plans.ts → PRICING_PLANS), so these strings
 * must stay verbatim — a mismatch silently redirects to the billing page
 * instead of Stripe.
 */
export type ProxyPlanName =
  | 'Starter'
  | 'Hobby'
  | 'Small Team'
  | 'Growth'
  | 'Scale'
  | 'Enterprise'

/**
 * Proxy checkout is a GET endpoint built for exactly this hand-off: it
 * creates the Stripe session server-side and 302s straight to Stripe, so
 * the user never stops at the dashboard UI.
 *
 * Note the dashboard rejects users who already hold an active proxy
 * subscription — they're redirected to its billing page to upgrade
 * instead. That's the dashboard's call to make, not ours.
 */
export function proxyCheckoutUrl(plan: ProxyPlanName, proxies: number): string {
  const q = new URLSearchParams({ plan, proxies: String(proxies) })
  return `${DASH}/api/checkout?${q}`
}

export function openProxyCheckout(plan: ProxyPlanName, proxies: number): void {
  window.open(proxyCheckoutUrl(plan, proxies), '_blank', 'noopener,noreferrer')
}

/**
 * Phone numbers have no GET checkout route on the dashboard — its endpoint
 * is POST-only and takes a JSON body, which a cross-origin link can't
 * supply. Until a GET wrapper exists there we land the user on the
 * dashboard's phone-numbers page, where the same checkout is one click away.
 */
const PHONE_URL = `${DASH}/phone-numbers`

export function openPhoneCheckout(): void {
  window.open(PHONE_URL, '_blank', 'noopener,noreferrer')
}

/** Volume above the largest self-service proxy plan is a sales conversation. */
export const PROXY_SALES_URL = `${DASH}/support`
