// A multi-product purchase, executed as a sequence of Stripe Checkouts.
//
// WHY SEQUENTIAL, not one session:
//
// One Checkout session in `mode: subscription` creates exactly ONE
// subscription — Stripe rejects per-line-item `subscription_data` (verified
// against the live API: "Received unknown parameter"). But three tables each
// require a UNIQUE stripe_subscription_id:
//
//   ghost.workspaces           → the TubeGhost plan
//   public.subscriptions       → proxies      (TubeProxies-owned)
//   public.phone_subscriptions → phone numbers (TubeProxies-owned)
//
// One id cannot satisfy all three, so each product needs its own
// subscription, and therefore its own session. The card is entered once —
// later sessions reuse the saved Stripe customer.
//
// The user still configures everything on one page and clicks Buy once; the
// steps run back-to-back, each returning to a URL that launches the next.

import type { Cycle, GhostPlanKey } from './pricing.js'

export type OrderStepKind = 'plan' | 'proxies' | 'numbers'

export interface OrderStep {
  kind: OrderStepKind
  /** Bundle size. Ignored for `plan`. */
  quantity: number
}

export interface Order {
  workspaceId: string
  plan: GhostPlanKey
  cycle: Cycle
  profiles: number
  /** Total configured members, not the billable extras. */
  seats: number
  /** Proxy bundle size, 0 for none. */
  proxies: number
  /** Phone bundle size, 0 for none. */
  numbers: number
}

/**
 * The steps an order runs, in order.
 *
 * Plan always goes first: it is the purchase the customer came for, and if
 * they abandon partway they should at least have that rather than proxies
 * attached to a free workspace.
 */
export function orderSteps(order: Order): OrderStep[] {
  const steps: OrderStep[] = [{ kind: 'plan', quantity: 1 }]
  if (order.proxies > 0) steps.push({ kind: 'proxies', quantity: order.proxies })
  if (order.numbers > 0) steps.push({ kind: 'numbers', quantity: order.numbers })
  return steps
}

/** Human label for the progress indicator. */
export function stepLabel(kind: OrderStepKind): string {
  switch (kind) {
    case 'plan':
      return 'your plan'
    case 'proxies':
      return 'proxies'
    case 'numbers':
      return 'phone numbers'
  }
}

/**
 * Metadata for a TubeProxies step's Stripe session.
 *
 * CRITICAL: these keys are TubeProxies' OWN contract, not ours. Their webhook
 * dispatcher (checkout-completed.ts) branches on `type === 'phone_number'`
 * and otherwise reads `proxy_count` / `plan_name`. Sending our own key names
 * would fall through to their else-branch, which bails on missing fields —
 * the customer would pay and receive nothing.
 *
 * `plan_name` must match a name in their PRICING_PLANS exactly.
 */
export function tubeproxiesMetadata(
  kind: 'proxies' | 'numbers',
  quantity: number,
  userId: string,
  planName?: string
): Record<string, string> {
  if (kind === 'numbers') {
    return {
      type: 'phone_number',
      user_id: userId,
      phone_quantity: String(quantity)
    }
  }
  return {
    user_id: userId,
    proxy_count: String(quantity),
    plan_name: planName ?? ''
  }
}
