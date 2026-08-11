// Turns a completed setup-mode checkout into subscriptions.
//
// Setup mode saved the card without charging. Here we create one subscription
// per product and charge that card. This is where a single checkout page
// becomes three subscriptions — which the schema requires, since
// ghost.workspaces, public.subscriptions and public.phone_subscriptions each
// store their own unique stripe_subscription_id.
//
// FAILURE POLICY (product decision):
//   plan fails    → abandon the order. Add-ons attached to a workspace with
//                   no plan is a nonsense state, and the plan is what they
//                   came for. Anything already created is cancelled.
//   add-on fails  → keep what succeeded and report the failure. The customer
//                   asked for a plan and proxies; losing the plan too because
//                   a card hiccuped on the second charge is worse for them,
//                   and proxies/numbers are independently cancellable anyway.
//
// IDEMPOTENCY: Stripe retries webhooks. Every subscription create carries a
// key derived from (setup intent, product), so a retry returns the ORIGINAL
// subscription instead of creating a second one and charging twice.

import {
  cancelSubscription,
  createSubscription,
  setDefaultPaymentMethod,
  StripeError,
  type LineItem
} from '../../stripe.js'
import { phonePrice, proxyPrice } from '../../../../src/shared/price-catalogue.js'
import { proxyBundleFor } from '../../../../src/shared/addons.js'
import { cartProducts, type Cart, type CartProduct } from '../../../../src/shared/cart.js'
import { planLineItems } from './checkout-single.js'

const env: (n: string) => string | undefined = (n) => process.env[n]

export interface ProductOutcome {
  product: CartProduct
  status: 'succeeded' | 'failed'
  subscriptionId?: string
  /** Stripe's own decline reason, safe to show — never card data. */
  error?: string
}

export interface FulfilResult {
  outcomes: ProductOutcome[]
  /** True when the plan itself failed and the order was abandoned. */
  aborted: boolean
}

/**
 * Create every subscription the cart calls for.
 *
 * `setupIntentId` seeds the idempotency keys, so re-running this for the same
 * checkout is safe and returns the same subscriptions.
 */
export async function fulfilCart(
  cart: Cart,
  customerId: string,
  userId: string,
  setupIntentId: string,
  paymentMethodId: string | null
): Promise<FulfilResult> {
  // Future invoices must charge the card they just saved, otherwise renewals
  // fail even though the first charge worked.
  if (paymentMethodId) {
    try {
      await setDefaultPaymentMethod(customerId, paymentMethodId)
    } catch {
      // Non-fatal: the subscription create below still uses the customer's
      // default, and a missing default surfaces there as a clear failure.
    }
  }

  const outcomes: ProductOutcome[] = []

  for (const product of cartProducts(cart)) {
    const items = lineItemsFor(product, cart)
    if (!items) {
      outcomes.push({ product, status: 'failed', error: 'Product is not available.' })
      if (product === 'profile_plan') return abort(outcomes)
      continue
    }

    try {
      const sub = await createSubscription({
        customer: customerId,
        items,
        metadata: metadataFor(product, cart, userId),
        idempotencyKey: `${setupIntentId}:${product}`
      })
      outcomes.push({ product, status: 'succeeded', subscriptionId: sub.id })
    } catch (err) {
      const message =
        err instanceof StripeError ? err.message : 'The payment could not be completed.'
      outcomes.push({ product, status: 'failed', error: message })

      // The plan is the order. Without it, unwind.
      if (product === 'profile_plan') return abort(outcomes)
    }
  }

  return { outcomes, aborted: false }
}

/** Cancel anything already created, so a failed order leaves no charges. */
async function abort(outcomes: ProductOutcome[]): Promise<FulfilResult> {
  for (const o of outcomes) {
    if (o.status === 'succeeded' && o.subscriptionId) {
      try {
        await cancelSubscription(o.subscriptionId)
      } catch {
        // Logged by the caller; a stranded subscription is visible in Stripe
        // and better than throwing away the outcome report.
      }
    }
  }
  return { outcomes, aborted: true }
}

function lineItemsFor(product: CartProduct, cart: Cart): LineItem[] | null {
  if (product === 'profile_plan') {
    const items = planLineItems(cart)
    return items.every((i) => i.price) ? items : null
  }
  if (product === 'proxy') {
    const price = proxyPrice(cart.proxies, cart.cycle, env)
    return price ? [{ price, quantity: 1 }] : null
  }
  const price = phonePrice(cart.numbers, cart.cycle, env)
  return price ? [{ price, quantity: 1 }] : null
}

/**
 * Metadata each product's webhook handler reads.
 *
 * The proxy and phone entries use TUBEPROXIES' key names — their dispatcher
 * branches on `type === 'phone_number'` and otherwise reads `proxy_count` /
 * `plan_name`. Renaming these sends the purchase down their else-branch,
 * which bails on missing fields: the customer pays and receives nothing.
 */
function metadataFor(
  product: CartProduct,
  cart: Cart,
  userId: string
): Record<string, string> {
  if (product === 'profile_plan') {
    return {
      product: 'tubeghost',
      user_id: userId,
      workspace_id: cart.workspaceId,
      plan_key: cart.plan,
      cycle: cart.cycle,
      profile_quota: String(cart.profiles),
      seat_quota: String(cart.seats)
    }
  }
  if (product === 'proxy') {
    return {
      user_id: userId,
      proxy_count: String(cart.proxies),
      plan_name: proxyBundleFor(cart.proxies)?.name ?? '',
      origin: 'tubeghost'
    }
  }
  return {
    type: 'phone_number',
    user_id: userId,
    phone_quantity: String(cart.numbers),
    origin: 'tubeghost'
  }
}
