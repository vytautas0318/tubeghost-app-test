// What the customer configured, in one object.
//
// Carried through the whole single-page flow: built by the configurator,
// validated by /api/billing/checkout-single, stored on the Stripe SetupIntent
// as metadata, then re-read by the webhook to create the subscriptions.
//
// Quantities and selections ONLY — never prices or totals. The server
// recomputes every amount from the price catalogue, so a tampered cart can
// change what someone buys but never what it costs.

import type { Cycle, GhostPlanKey } from './pricing.js'

export interface Cart {
  workspaceId: string
  plan: GhostPlanKey
  cycle: Cycle
  /** Team only. Ignored for Starter, which has fixed allowances. */
  profiles: number
  /** TOTAL members configured, not the billable extras. */
  seats: number
  /** Proxy bundle size, 0 for none. */
  proxies: number
  /** Phone bundle size, 0 for none. */
  numbers: number
}

/** The products a cart will create subscriptions for, in creation order. */
export type CartProduct = 'profile_plan' | 'proxy' | 'phone_number'

/**
 * Which subscriptions this cart needs.
 *
 * The plan is always first and is the one that matters most: if it fails
 * there is nothing to attach add-ons to, so the whole order is abandoned.
 * An add-on failing leaves the rest intact.
 */
export function cartProducts(cart: Cart): CartProduct[] {
  const out: CartProduct[] = ['profile_plan']
  if (cart.proxies > 0) out.push('proxy')
  if (cart.numbers > 0) out.push('phone_number')
  return out
}

export function productLabel(p: CartProduct): string {
  switch (p) {
    case 'profile_plan':
      return 'Plan'
    case 'proxy':
      return 'Proxies'
    case 'phone_number':
      return 'Phone numbers'
  }
}

/** Parse a cart back out of Stripe metadata. Returns null if unusable. */
export function parseCart(raw: string | undefined): Cart | null {
  if (!raw) return null
  try {
    const c = JSON.parse(raw) as Partial<Cart>
    if (typeof c.workspaceId !== 'string' || !c.plan || !c.cycle) return null
    return {
      workspaceId: c.workspaceId,
      plan: c.plan,
      cycle: c.cycle,
      profiles: Number(c.profiles ?? 0),
      seats: Number(c.seats ?? 0),
      proxies: Number(c.proxies ?? 0),
      numbers: Number(c.numbers ?? 0)
    }
  } catch {
    return null
  }
}
