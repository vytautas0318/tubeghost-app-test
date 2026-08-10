// POST /api/billing/checkout — start a TubeGhost profile-plan subscription.
//
// Returns { url } for the client to redirect to. We never take payment
// details ourselves; Stripe Checkout does, and the webhook grants the quota
// once payment succeeds. Nothing here mutates the workspace — a user who
// abandons checkout gets nothing, which is the point.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../../session.js'
import { getWorkspace } from '../../billing-db.js'
import {
  createCheckoutSession,
  findOrCreateCustomer,
  StripeError,
  type LineItem
} from '../../stripe.js'
import {
  missingPriceVars,
  priceId,
  pricesConfigured,
  PRODUCT_TAG,
  stripeConfigured
} from '../../stripe-env.js'
import { PUBLIC_BASE_URL } from '../../env.js'
import {
  isCycle,
  isGhostPlanKey,
  STARTER_PROFILES,
  STARTER_SEATS,
  validateTeamConfig,
  type Cycle,
  type GhostPlanKey
} from '../../../../src/shared/pricing.js'

interface Body {
  workspaceId?: unknown
  plan?: unknown
  cycle?: unknown
  profiles?: unknown
  seats?: unknown
}

export default async function checkout(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!stripeConfigured()) {
    res.status(503).json({ error: 'billing_not_configured', detail: 'STRIPE_SECRET_KEY unset' })
    return
  }

  const session = await requireSession(req.headers.authorization)
  if (!session) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (!session.email) {
    // Stripe needs an email to attach (and reuse) the customer record.
    res.status(400).json({ error: 'email_required' })
    return
  }

  const body = (req.body ?? {}) as Body
  const plan = body.plan
  const cycle = body.cycle

  if (!isGhostPlanKey(plan)) {
    res.status(400).json({ error: 'invalid_plan' })
    return
  }
  if (!isCycle(cycle)) {
    res.status(400).json({ error: 'invalid_cycle' })
    return
  }
  if (typeof body.workspaceId !== 'string' || !body.workspaceId) {
    res.status(400).json({ error: 'workspace_required' })
    return
  }

  // Ownership: the session user must own the workspace they're buying for.
  // Without this check any authenticated user could attach a subscription to
  // someone else's workspace.
  const workspace = await getWorkspace(body.workspaceId)
  if (!workspace) {
    res.status(404).json({ error: 'workspace_not_found' })
    return
  }
  if (workspace.owner_id !== session.userId) {
    res.status(403).json({ error: 'not_workspace_owner' })
    return
  }
  if (workspace.tubeghost_subscription_id) {
    // Changing an existing plan is the billing portal's job — creating a
    // second subscription would double-charge and leave two quotas racing.
    res.status(409).json({ error: 'subscription_exists' })
    return
  }

  if (!pricesConfigured(plan, cycle)) {
    res.status(503).json({
      error: 'prices_not_configured',
      detail: `Missing: ${missingPriceVars(plan, cycle).join(', ')}`
    })
    return
  }

  const built = buildLineItems(plan, cycle, body)
  if ('error' in built) {
    res.status(400).json({ error: 'invalid_quantity', detail: built.error })
    return
  }

  try {
    const customer = await findOrCreateCustomer(session.email, session.userId)
    const checkoutSession = await createCheckoutSession({
      customer,
      lineItems: built.lineItems,
      successUrl: `${PUBLIC_BASE_URL}/billing?checkout=success`,
      cancelUrl: `${PUBLIC_BASE_URL}/billing?checkout=canceled`,
      metadata: {
        // PRODUCT_TAG is what keeps this account's two products apart — the
        // TubeProxies handlers ignore anything carrying it, and ours ignores
        // anything without it.
        product: PRODUCT_TAG,
        user_id: session.userId,
        workspace_id: workspace.id,
        plan_key: plan,
        cycle,
        profile_quota: String(built.profiles),
        seat_quota: String(built.seats)
      }
    })

    if (!checkoutSession.url) {
      res.status(502).json({ error: 'stripe_no_url' })
      return
    }
    res.status(200).json({ url: checkoutSession.url })
  } catch (err) {
    if (err instanceof StripeError) {
      // Surface Stripe's message: it's usually actionable ("No such price"
      // means a wrong/unset price ID) and contains no cardholder data.
      res.status(502).json({ error: 'stripe_error', detail: err.message })
      return
    }
    res.status(500).json({ error: 'checkout_failed' })
  }
}

type BuiltItems =
  | { lineItems: LineItem[]; profiles: number; seats: number }
  | { error: string }

/**
 * Translate a plan request into Stripe line items.
 *
 * Starter is one flat price with fixed allowances. Team is the graduated
 * profiles price (quantity = profile count, Stripe computes the bracket
 * total) plus an optional flat seat price.
 */
function buildLineItems(plan: GhostPlanKey, cycle: Cycle, body: Body): BuiltItems {
  if (plan === 'starter') {
    return {
      lineItems: [{ price: priceId('starter', cycle), quantity: 1 }],
      profiles: STARTER_PROFILES,
      seats: STARTER_SEATS
    }
  }

  const profiles = Number(body.profiles)
  const seats = Number(body.seats ?? 0)
  const invalid = validateTeamConfig(profiles, seats)
  if (invalid) return { error: invalid }

  const lineItems: LineItem[] = [{ price: priceId('profiles', cycle), quantity: profiles }]
  if (seats > 0) lineItems.push({ price: priceId('seat', cycle), quantity: seats })

  // Team includes the owner's own seat on top of any purchased seats.
  return { lineItems, profiles, seats: seats + 1 }
}
