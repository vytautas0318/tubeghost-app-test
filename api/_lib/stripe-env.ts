// Server-only Stripe configuration for TubeGhost profile plans.
//
// Nothing here is VITE_-prefixed, so none of it reaches the renderer bundle.
// The secret key and webhook secret are real secrets — set them in Vercel,
// never in a VITE_* var (anyone can extract those from the client bundle).
//
// ONE Stripe account serves both products: TubeProxies sells proxies + phone
// numbers, TubeGhost sells profile plans. That means our webhook receives
// TubeProxies events too, and theirs receives ours. Both sides must ignore
// what isn't theirs — see PRODUCT_TAG below.

import type { Cycle, GhostPlanKey } from '../../src/shared/pricing.js'

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? ''
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_TUBEGHOST_WEBHOOK_SECRET ?? ''

/**
 * Stamped into every subscription's metadata as `product`. The TubeProxies
 * dashboard's handlers key off their own metadata (`type: 'phone_number'`,
 * `proxy_count`, …) and must not act on ours; ours ignores anything without
 * this tag. This is the contract that lets one account serve both products.
 */
export const PRODUCT_TAG = 'tubeghost'

/**
 * Price IDs, supplied per environment (test vs live).
 *
 * Nothing is hardcoded — a price ID differs between Stripe test mode and live
 * mode, so committing one guarantees a production mismatch.
 *
 * Setup, per src/shared/pricing.ts:
 *   TG_PRICE_STARTER_*  → flat: $19/mo, $51.30/qtr, $190/yr
 *   TG_PRICE_PROFILES_* → GRADUATED tiers, qty 25–1000 (NOT Volume)
 *   TG_PRICE_SEAT_*     → flat per-unit: $2.50/seat/mo
 */
const PRICE_ENV = {
  starter: {
    monthly: 'TG_PRICE_STARTER_MONTHLY',
    quarterly: 'TG_PRICE_STARTER_QUARTERLY',
    annual: 'TG_PRICE_STARTER_ANNUAL'
  },
  profiles: {
    monthly: 'TG_PRICE_PROFILES_MONTHLY',
    quarterly: 'TG_PRICE_PROFILES_QUARTERLY',
    annual: 'TG_PRICE_PROFILES_ANNUAL'
  },
  seat: {
    monthly: 'TG_PRICE_SEAT_MONTHLY',
    quarterly: 'TG_PRICE_SEAT_QUARTERLY',
    annual: 'TG_PRICE_SEAT_ANNUAL'
  }
} as const

export type PriceKind = keyof typeof PRICE_ENV

export function priceId(kind: PriceKind, cycle: Cycle): string {
  return process.env[PRICE_ENV[kind][cycle]] ?? ''
}

/** Which prices a plan needs. Starter is one flat line; Team is metered. */
export function requiredPrices(plan: GhostPlanKey): PriceKind[] {
  return plan === 'starter' ? ['starter'] : ['profiles', 'seat']
}

/**
 * True when every price this plan+cycle needs is configured. Checkout calls
 * this first so a missing env var surfaces as a clear 503 rather than an
 * opaque Stripe "No such price" error.
 */
export function pricesConfigured(plan: GhostPlanKey, cycle: Cycle): boolean {
  return requiredPrices(plan).every((k) => Boolean(priceId(k, cycle)))
}

/** Names of the env vars a plan+cycle needs — for the 503's detail field. */
export function missingPriceVars(plan: GhostPlanKey, cycle: Cycle): string[] {
  return requiredPrices(plan)
    .filter((k) => !priceId(k, cycle))
    .map((k) => PRICE_ENV[k][cycle])
}

export function stripeConfigured(): boolean {
  return Boolean(STRIPE_SECRET_KEY)
}

/** True when the configured key is a Stripe test-mode key. */
export function isTestMode(): boolean {
  return STRIPE_SECRET_KEY.startsWith('sk_test_')
}

/**
 * Whether Checkout should compute tax automatically.
 *
 * Defaults to ON, and can only be turned off in TEST mode. Stripe Tax needs
 * an origin address configured per mode; an unconfigured test account rejects
 * checkout with "The customer's location isn't recognized", which blocks
 * end-to-end testing for a reason that has nothing to do with our code.
 *
 * Production must never skip this — we sell into the EU/UK where VAT is a
 * legal requirement, and TubeProxies' live checkout already collects it. The
 * live-key guard makes "disabled in prod" unreachable even if the env var is
 * set there by mistake.
 */
export function automaticTaxEnabled(): boolean {
  const optedOut = process.env.TG_DISABLE_AUTOMATIC_TAX === 'true'
  return !(optedOut && isTestMode())
}
