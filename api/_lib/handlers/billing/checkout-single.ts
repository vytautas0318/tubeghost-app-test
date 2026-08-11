// POST /api/billing/checkout-single — ONE checkout page for the whole order.
//
// Stripe cannot create three subscriptions from one Checkout session, and our
// schema needs three (ghost.workspaces, public.subscriptions,
// public.phone_subscriptions each store their own unique subscription id).
//
// So this uses `mode: 'setup'`: Stripe collects and saves the card WITHOUT
// charging. The webhook then creates the subscriptions server-side, one per
// product, each charging the saved card. The customer sees a single page.
//
// The trade-off: payment failure becomes OUR problem rather than Stripe's.
// The webhook reports per-item outcomes and the processing page surfaces
// them — see checkout-complete.ts.
//
// The cart is validated here and re-derived from metadata in the webhook.
// Amounts are never accepted from the client, only quantities and selections.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../../session.js'
import { countActiveProxies, countAvailableInventory, getWorkspace } from '../../billing-db.js'
import { createSetupSession, findOrCreateCustomer, StripeError } from '../../stripe.js'
import { stripeConfigured } from '../../stripe-env.js'
import { PUBLIC_BASE_URL } from '../../env.js'
import {
  ghostPrice,
  phonePrice,
  proxyPrice,
  requiredGhostVars
} from '../../../../src/shared/price-catalogue.js'
import { proxyBundleAddsValue, proxyBundleFor, phoneBundleFor } from '../../../../src/shared/addons.js'
import {
  addOnsAvailable,
  applyCycle,
  billableSeats,
  billedTotal,
  isCycle,
  isGhostPlanKey,
  money,
  pfPrice,
  PLANS,
  SEAT_RATE,
  STARTER_BASE,
  validateTeamConfig
} from '../../../../src/shared/pricing.js'
import { addOnsList } from '../../../../src/shared/addons.js'
import type { Cart } from '../../../../src/shared/cart.js'

const env: (n: string) => string | undefined = (n) => process.env[n]

export default async function checkoutSingle(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!stripeConfigured()) {
    res.status(503).json({ error: 'billing_not_configured' })
    return
  }

  const session = await requireSession(req.headers.authorization)
  if (!session?.email) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const b = (req.body ?? {}) as Record<string, unknown>
  if (!isGhostPlanKey(b.plan) || !isCycle(b.cycle) || typeof b.workspaceId !== 'string') {
    res.status(400).json({ error: 'invalid_cart' })
    return
  }

  const cart: Cart = {
    workspaceId: b.workspaceId,
    plan: b.plan,
    cycle: b.cycle,
    profiles: Number(b.profiles ?? 0),
    seats: Number(b.seats ?? 0),
    proxies: Number(b.proxies ?? 0),
    numbers: Number(b.numbers ?? 0)
  }

  // ── Ownership ────────────────────────────────────────────────────
  const workspace = await getWorkspace(cart.workspaceId)
  if (!workspace) {
    res.status(404).json({ error: 'workspace_not_found' })
    return
  }
  if (workspace.owner_id !== session.userId) {
    res.status(403).json({ error: 'not_workspace_owner' })
    return
  }
  if (workspace.stripe_subscription_id) {
    res.status(409).json({ error: 'subscription_exists' })
    return
  }

  // ── Cart validity ────────────────────────────────────────────────
  const problem = await validateCart(cart, session.userId)
  if (problem) {
    res.status(400).json({ error: 'invalid_cart', detail: problem })
    return
  }

  try {
    const customer = await findOrCreateCustomer(session.email, session.userId)
    const checkout = await createSetupSession({
      customer,
      successUrl: `${PUBLIC_BASE_URL}/billing?processing={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${PUBLIC_BASE_URL}/billing?checkout=canceled`,
      // The webhook rebuilds the order from this. Stripe caps a metadata
      // value at 500 chars; a cart is well under that.
      metadata: {
        cart: JSON.stringify(cart),
        user_id: session.userId,
        product: 'tubeghost'
      },
      // Recomputed here, never taken from the client — the page must state
      // the real amount, and a tampered cart must not change what is shown.
      chargeSummary: chargeSummaryFor(cart)
    })

    if (!checkout.url) {
      res.status(502).json({ error: 'stripe_no_url' })
      return
    }
    res.status(200).json({ url: checkout.url })
  } catch (err) {
    if (err instanceof StripeError) {
      res.status(502).json({ error: 'stripe_error', detail: err.message })
      return
    }
    res.status(500).json({ error: 'checkout_failed' })
  }
}

/**
 * Everything that can be known to fail before the card is collected.
 *
 * Returns a message, or null when the cart is buyable. Deliberately strict:
 * once setup mode completes we charge server-side, so a cart that cannot be
 * fulfilled would become a refund rather than a declined checkout.
 */
async function validateCart(cart: Cart, userId: string): Promise<string | null> {
  // Plan prices must exist for this cycle.
  const missing = requiredGhostVars(cart.plan, cart.cycle).filter((v) => !env(v))
  if (missing.length) return `Billing is not configured for ${cart.cycle} yet.`

  if (cart.plan === 'starter' && !ghostPrice('starter', cart.cycle, env)) {
    return `The Starter plan is not available ${cart.cycle}.`
  }
  if (cart.plan === 'team') {
    const invalid = validateTeamConfig(cart.profiles, cart.seats)
    if (invalid) return invalid
  }

  const wantsAddOns = cart.proxies > 0 || cart.numbers > 0
  if (wantsAddOns && !addOnsAvailable(cart.cycle)) {
    return 'Proxies and phone numbers cannot be added to an annual plan.'
  }

  if (cart.proxies > 0) {
    if (!proxyBundleFor(cart.proxies)) return `No ${cart.proxies}-proxy bundle exists.`
    if (!proxyPrice(cart.proxies, cart.cycle, env)) {
      return `The ${cart.proxies}-proxy bundle is not available ${cart.cycle}.`
    }
    // Assignment is capped at greatest(0, limit − owned): a bundle at or
    // below what they hold charges them and assigns nothing.
    const owned = await countActiveProxies(userId)
    if (!proxyBundleAddsValue(cart.proxies, owned)) {
      return `You already have ${owned} proxies — choose a larger bundle.`
    }
    const needed = Math.max(0, cart.proxies - owned)
    const available = await countAvailableInventory()
    if (available !== null && needed > available) {
      return available === 0
        ? 'Proxies are out of stock right now.'
        : `Only ${available} proxies in stock — choose a smaller bundle.`
    }
  }

  if (cart.numbers > 0) {
    if (!phoneBundleFor(cart.numbers)) return `No ${cart.numbers}-number bundle exists.`
    if (!phonePrice(cart.numbers, cart.cycle, env)) {
      return `The ${cart.numbers}-number bundle is not available ${cart.cycle}.`
    }
  }

  return null
}

/**
 * The sentence shown above Stripe's submit button.
 *
 * Setup mode displays no price of its own, so this is the ONLY place the
 * customer sees what they are agreeing to pay on the payment page itself.
 * Computed from the price catalogue, never from the client.
 *
 * Says "billed separately" because the products are separate subscriptions —
 * the customer will see more than one line on their statement, and finding
 * that out afterwards causes support tickets.
 */
export function chargeSummaryFor(cart: Cart): string {
  const planMonthly =
    cart.plan === 'starter'
      ? STARTER_BASE
      : pfPrice(cart.profiles) + billableSeats(PLANS.team, cart.seats) * SEAT_RATE
  const addOns = addOnsList(cart.proxies, cart.numbers)
  const monthly = applyCycle(planMonthly + addOns, cart.cycle)
  const each = billedTotal(monthly, cart.cycle)

  const per =
    cart.cycle === 'annual' ? 'year' : cart.cycle === 'quarterly' ? '3 months' : 'month'
  const amount = money(each || monthly)
  const parts = ['your plan']
  if (cart.proxies > 0) parts.push('proxies')
  if (cart.numbers > 0) parts.push('phone numbers')

  const items =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

  return parts.length > 1
    ? `${amount} per ${per} for ${items}, billed separately per item.`
    : `${amount} per ${per} for ${items}.`
}

/** Line items for the plan itself, used by the webhook when it subscribes. */
export function planLineItems(cart: Cart): { price: string; quantity: number }[] {
  if (cart.plan === 'starter') {
    return [{ price: ghostPrice('starter', cart.cycle, env), quantity: 1 }]
  }
  const items = [{ price: ghostPrice('profiles', cart.cycle, env), quantity: cart.profiles }]
  const extra = billableSeats(PLANS.team, cart.seats)
  if (extra > 0) items.push({ price: ghostPrice('seat', cart.cycle, env), quantity: extra })
  return items
}
