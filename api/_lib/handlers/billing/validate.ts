// POST /api/billing/validate — can this order actually be fulfilled?
//
// Runs BEFORE any money moves. The point is to catch the failures we can
// predict — sold-out proxy stock, a bundle that would assign nothing, a
// missing price ID — while the customer can still change their selection,
// rather than after they have been charged.
//
// This reduces partial failures; it cannot eliminate them. Stock can sell out
// between validation and payment, and a card decline is never predictable. So
// the checkout path still validates everything itself — this endpoint is a
// better error surface, never the only guard.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../../session.js'
import {
  countActiveProxies,
  countAvailableInventory,
  getWorkspace,
  hasActivePhoneSubscription,
  hasActiveProxySubscription
} from '../../billing-db.js'
import { phonePriceId, priceId, proxyPriceId, stripeConfigured } from '../../stripe-env.js'
import {
  phoneBundleFor,
  proxyBundleAddsValue,
  proxyBundleFor
} from '../../../../src/shared/addons.js'
import {
  addOnsAvailable,
  isCycle,
  isGhostPlanKey,
  validateTeamConfig,
  type Cycle
} from '../../../../src/shared/pricing.js'

/** One problem found with the order. `blocking` stops checkout entirely. */
export interface Issue {
  item: 'plan' | 'proxies' | 'numbers'
  message: string
  blocking: boolean
}

interface Body {
  workspaceId?: unknown
  plan?: unknown
  cycle?: unknown
  profiles?: unknown
  seats?: unknown
  proxies?: unknown
  numbers?: unknown
}

export default async function validate(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const session = await requireSession(req.headers.authorization)
  if (!session) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const body = (req.body ?? {}) as Body
  if (!isGhostPlanKey(body.plan) || !isCycle(body.cycle)) {
    res.status(400).json({ error: 'invalid_order' })
    return
  }
  const plan = body.plan
  const cycle = body.cycle
  const proxies = Number(body.proxies ?? 0)
  const numbers = Number(body.numbers ?? 0)

  const issues: Issue[] = []

  if (!stripeConfigured()) {
    issues.push({ item: 'plan', message: 'Billing is not configured yet.', blocking: true })
  }

  // ── Plan ─────────────────────────────────────────────────────────
  if (typeof body.workspaceId === 'string' && body.workspaceId) {
    const workspace = await getWorkspace(body.workspaceId)
    if (!workspace) {
      issues.push({ item: 'plan', message: 'Workspace not found.', blocking: true })
    } else if (workspace.owner_id !== session.userId) {
      issues.push({
        item: 'plan',
        message: 'Only the workspace owner can buy a plan.',
        blocking: true
      })
    } else if (workspace.stripe_subscription_id) {
      issues.push({
        item: 'plan',
        message: 'You already have a plan — change it from the billing portal.',
        blocking: true
      })
    }
  }

  if (plan === 'team') {
    const invalid = validateTeamConfig(Number(body.profiles), Number(body.seats))
    if (invalid) issues.push({ item: 'plan', message: invalid, blocking: true })
  }
  if (!priceId(plan === 'starter' ? 'starter' : 'profiles', cycle)) {
    issues.push({
      item: 'plan',
      message: `The ${plan} plan is not available ${cycle} yet.`,
      blocking: true
    })
  }

  // ── Add-ons ──────────────────────────────────────────────────────
  if ((proxies || numbers) && !addOnsAvailable(cycle)) {
    issues.push({
      item: proxies ? 'proxies' : 'numbers',
      message: 'Proxies and phone numbers cannot be added to an annual plan.',
      blocking: true
    })
  } else {
    if (proxies) issues.push(...(await checkProxies(proxies, cycle, session.userId)))
    if (numbers) issues.push(...(await checkNumbers(numbers, cycle, session.userId)))
  }

  res.status(200).json({
    ok: issues.every((i) => !i.blocking),
    issues
  })
}

async function checkProxies(
  quantity: number,
  cycle: Cycle,
  userId: string
): Promise<Issue[]> {
  const issues: Issue[] = []

  // One active proxy subscription per user (idx_one_active_subscription).
  // Buying more is an upgrade of the existing one, which this bundle does
  // not implement — so surface it before they pay rather than after.
  if (await hasActiveProxySubscription(userId)) {
    return [
      {
        item: 'proxies',
        message:
          'You already have a proxy subscription. Add more from the TubeProxies dashboard.',
        blocking: true
      }
    ]
  }

  if (!proxyBundleFor(quantity)) {
    return [{ item: 'proxies', message: `No ${quantity}-proxy bundle exists.`, blocking: true }]
  }
  if (!proxyPriceId(quantity, cycle)) {
    return [
      {
        item: 'proxies',
        message: `The ${quantity}-proxy bundle is not available ${cycle}.`,
        blocking: true
      }
    ]
  }

  // Assignment is capped at greatest(0, limit − owned), so a bundle at or
  // below what they hold charges them and assigns nothing.
  const owned = await countActiveProxies(userId)
  if (!proxyBundleAddsValue(quantity, owned)) {
    issues.push({
      item: 'proxies',
      message: `You already have ${owned} proxies — choose a larger bundle.`,
      blocking: true
    })
  }

  // Stock. Only what they'd actually be assigned needs to exist.
  const needed = Math.max(0, quantity - owned)
  const available = await countAvailableInventory()
  if (available !== null && needed > available) {
    issues.push({
      item: 'proxies',
      message:
        available === 0
          ? 'Proxies are out of stock right now.'
          : `Only ${available} proxies in stock — choose a smaller bundle.`,
      blocking: true
    })
  }

  return issues
}

async function checkNumbers(
  quantity: number,
  cycle: Cycle,
  userId: string
): Promise<Issue[]> {
  // one_active_phone_sub_per_user — same rule as proxies.
  if (await hasActivePhoneSubscription(userId)) {
    return [
      {
        item: 'numbers',
        message:
          'You already have a phone-number subscription. Add more from the TubeProxies dashboard.',
        blocking: true
      }
    ]
  }

  if (!phoneBundleFor(quantity)) {
    return [{ item: 'numbers', message: `No ${quantity}-number bundle exists.`, blocking: true }]
  }
  if (!phonePriceId(quantity, cycle)) {
    return [
      {
        item: 'numbers',
        message: `The ${quantity}-number bundle is not available ${cycle}.`,
        blocking: true
      }
    ]
  }

  // Phone stock cannot be checked from here: TubeProxies derives it from
  // their TextVerified account balance, behind credentials that must never
  // ship in a client. Numbers are also provisioned asynchronously with a
  // cron retry, so a short delay after purchase is normal rather than a
  // failure. Warn instead of blocking — blocking on an unknown would stop
  // every legitimate sale.
  return [
    {
      item: 'numbers',
      message: 'Numbers activate within a few minutes of purchase.',
      blocking: false
    }
  ]
}
