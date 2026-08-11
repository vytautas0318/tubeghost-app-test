// POST /api/billing/order — the next step of a multi-product purchase.
//
// The client posts the whole order plus which steps are already done; this
// returns the Stripe Checkout URL for the next one, or { done: true }.
//
// Stateless by design. The order lives in the client's sessionStorage rather
// than a new DB table: a half-finished order is not something we want to
// persist and later have to reconcile against Stripe, and the money side is
// already durable — each completed step has its own subscription and webhook.
// Abandoning mid-way simply means the remaining steps never happen.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../../session.js'
import { countActiveProxies, getWorkspace } from '../../billing-db.js'
import { createCheckoutSession, findOrCreateCustomer, StripeError } from '../../stripe.js'
import { phonePriceId, proxyPriceId, PRODUCT_TAG, stripeConfigured } from '../../stripe-env.js'
import { PUBLIC_BASE_URL } from '../../env.js'
import {
  phoneBundleFor,
  proxyBundleAddsValue,
  proxyBundleFor
} from '../../../../src/shared/addons.js'
import {
  orderSteps,
  tubeproxiesMetadata,
  type Order,
  type OrderStepKind
} from '../../../../src/shared/order.js'
import { addOnsAvailable, isCycle, isGhostPlanKey } from '../../../../src/shared/pricing.js'

interface Body {
  order?: Partial<Order>
  /** Steps already paid for, so a resumed order doesn't re-charge. */
  completed?: unknown
}

export default async function order(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!stripeConfigured()) {
    res.status(503).json({ error: 'billing_not_configured' })
    return
  }

  const session = await requireSession(req.headers.authorization)
  if (!session) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (!session.email) {
    res.status(400).json({ error: 'email_required' })
    return
  }

  const body = (req.body ?? {}) as Body
  const o = body.order ?? {}
  const completed = Array.isArray(body.completed) ? (body.completed as string[]) : []

  if (!isGhostPlanKey(o.plan) || !isCycle(o.cycle) || typeof o.workspaceId !== 'string') {
    res.status(400).json({ error: 'invalid_order' })
    return
  }

  const workspace = await getWorkspace(o.workspaceId)
  if (!workspace) {
    res.status(404).json({ error: 'workspace_not_found' })
    return
  }
  if (workspace.owner_id !== session.userId) {
    res.status(403).json({ error: 'not_workspace_owner' })
    return
  }

  const full: Order = {
    workspaceId: o.workspaceId,
    plan: o.plan,
    cycle: o.cycle,
    profiles: Number(o.profiles ?? 0),
    seats: Number(o.seats ?? 0),
    proxies: Number(o.proxies ?? 0),
    numbers: Number(o.numbers ?? 0)
  }

  // Add-ons ride the plan's cycle, and TubeProxies has no annual price — so
  // an annual order can only ever contain the plan step.
  if (!addOnsAvailable(full.cycle) && (full.proxies || full.numbers)) {
    res.status(400).json({ error: 'addons_unavailable_for_cycle' })
    return
  }

  const next = orderSteps(full).find((s) => !completed.includes(s.kind))
  if (!next) {
    res.status(200).json({ done: true })
    return
  }

  // The plan step goes through the normal checkout endpoint, which owns the
  // plan's own validation and metadata. Only the TubeProxies steps are built
  // here.
  if (next.kind === 'plan') {
    res.status(200).json({ step: 'plan', usePlanCheckout: true })
    return
  }

  // Active proxies this user already holds, read server-side rather than
  // trusted from the client.
  const ownedProxies =
    next.kind === 'proxies' ? await countActiveProxies(session.userId) : 0

  const built = buildAddOnStep(next.kind, next.quantity, full.cycle, ownedProxies)
  if ('error' in built) {
    res.status(400).json({ error: 'invalid_addon', detail: built.error })
    return
  }

  try {
    const customer = await findOrCreateCustomer(session.email, session.userId)
    const remaining = orderSteps(full).filter(
      (s) => !completed.includes(s.kind) && s.kind !== next.kind
    )

    const checkout = await createCheckoutSession({
      customer,
      lineItems: [{ price: built.price, quantity: 1 }],
      // Returning to /billing with the step marked done lets the client
      // launch whatever is left without the user clicking again.
      successUrl:
        `${PUBLIC_BASE_URL}/billing?order=continue&done=${[...completed, next.kind].join(',')}` +
        `&remaining=${remaining.length}`,
      cancelUrl: `${PUBLIC_BASE_URL}/billing?order=canceled`,
      metadata: {
        // TubeProxies' OWN keys — their dispatcher reads these. Do not
        // rename them to ours.
        ...tubeproxiesMetadata(next.kind, next.quantity, session.userId, built.planName),
        // Provenance only; their handlers ignore unknown keys.
        origin: PRODUCT_TAG,
        workspace_id: full.workspaceId
      }
    })

    if (!checkout.url) {
      res.status(502).json({ error: 'stripe_no_url' })
      return
    }
    res.status(200).json({ step: next.kind, url: checkout.url, remaining: remaining.length })
  } catch (err) {
    if (err instanceof StripeError) {
      res.status(502).json({ error: 'stripe_error', detail: err.message })
      return
    }
    res.status(500).json({ error: 'order_failed' })
  }
}

/** Resolve the price (and plan name, for proxies) for one add-on step. */
function buildAddOnStep(
  kind: Exclude<OrderStepKind, 'plan'>,
  quantity: number,
  cycle: Order['cycle'],
  ownedProxies: number
): { price: string; planName?: string } | { error: string } {
  if (kind === 'proxies') {
    const bundle = proxyBundleFor(quantity)
    if (!bundle) return { error: `No proxy bundle of ${quantity}.` }
    // The UI hides these, but a stale page could still submit one. Assigning
    // is capped at greatest(0, limit − owned), so a bundle at or below what
    // they hold would charge them and assign nothing.
    if (!proxyBundleAddsValue(quantity, ownedProxies)) {
      return {
        error: `You already have ${ownedProxies} proxies — choose a larger bundle.`
      }
    }
    const price = proxyPriceId(quantity, cycle)
    if (!price) return { error: `Proxy bundle of ${quantity} is unavailable ${cycle}.` }
    // Their handler writes plan_name into public.subscriptions and looks it
    // up in PRICING_PLANS — it must be the dashboard's exact plan name.
    return { price, planName: bundle.name }
  }

  const bundle = phoneBundleFor(quantity)
  if (!bundle) return { error: `No phone bundle of ${quantity}.` }
  const price = phonePriceId(quantity, cycle)
  if (!price) return { error: `Phone bundle of ${quantity} is unavailable ${cycle}.` }
  return { price }
}
