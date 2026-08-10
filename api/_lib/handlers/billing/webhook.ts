// POST /api/billing/webhook — Stripe events for TubeGhost profile plans.
//
// ONE Stripe account serves both products, so this endpoint receives
// TubeProxies events too (proxy plans, phone numbers). Every handler below
// returns early unless the event carries `metadata.product === 'tubeghost'`.
// Without that guard we'd grant profile quota on a proxy purchase.
//
// Requires the RAW body for signature verification — the route that mounts
// this disables Vercel's body parser.
//
// Idempotent by construction: each handler writes an absolute desired state
// derived from the subscription, never a delta, so a redelivered event
// produces the same result.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getWorkspace,
  getWorkspaceBySubscription,
  setWorkspaceSubscription
} from '../../billing-db.js'
import { getSubscription, verifyWebhookSignature, type StripeSubscription } from '../../stripe.js'
import { PRODUCT_TAG, STRIPE_WEBHOOK_SECRET } from '../../stripe-env.js'

interface StripeEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

/** Read the raw request body. Vercel gives us a stream when parsing is off. */
async function readRawBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

export default async function webhook(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    res.status(503).json({ error: 'webhook_not_configured' })
    return
  }

  const raw = await readRawBody(req)
  const sig = req.headers['stripe-signature']
  const header = Array.isArray(sig) ? sig[0] : sig

  if (!verifyWebhookSignature(raw, header, STRIPE_WEBHOOK_SECRET)) {
    // 400, not 401: Stripe retries on 4xx/5xx alike, and a bad signature
    // means the payload is untrusted — never act on it.
    res.status(400).json({ error: 'invalid_signature' })
    return
  }

  let event: StripeEvent
  try {
    event = JSON.parse(raw) as StripeEvent
  } catch {
    res.status(400).json({ error: 'invalid_payload' })
    return
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event)
        break
      case 'customer.subscription.updated':
        await onSubscriptionUpdated(event)
        break
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(event)
        break
      default:
        // Everything else (invoices, payment intents, all TubeProxies
        // events) is intentionally ignored.
        break
    }
    res.status(200).json({ received: true })
  } catch (err) {
    // 500 makes Stripe retry with backoff — the right outcome for a
    // transient DB failure. Log for the ones that aren't transient.
    console.error(`[billing] ${event.type} (${event.id}) failed:`, err)
    res.status(500).json({ error: 'handler_failed' })
  }
}

/** Ours? Guard against acting on the other product's events. */
function isOurs(metadata: Record<string, string> | undefined): boolean {
  return metadata?.product === PRODUCT_TAG
}

/**
 * Grant quota once payment completes.
 *
 * The session's metadata carries what was purchased. We re-fetch the
 * subscription to confirm it exists and is live rather than trusting the
 * session alone.
 */
async function onCheckoutCompleted(event: StripeEvent): Promise<void> {
  const session = event.data.object as {
    subscription?: string
    metadata?: Record<string, string>
  }
  if (!isOurs(session.metadata)) return

  const subscriptionId = session.subscription
  if (!subscriptionId) return

  const meta = session.metadata ?? {}
  const workspaceId = meta.workspace_id
  if (!workspaceId) {
    console.error('[billing] checkout.session.completed without workspace_id', event.id)
    return
  }

  const workspace = await getWorkspace(workspaceId)
  if (!workspace) {
    console.error('[billing] checkout for unknown workspace', workspaceId)
    return
  }

  const sub = await getSubscription(subscriptionId)
  // A subscription that never became active (failed first payment) grants
  // nothing; the later subscription.updated event will grant it if it does.
  if (!isLive(sub.status)) return

  await applySubscription(workspaceId, sub, meta)
}

/**
 * Write the subscription's state onto the workspace.
 *
 * `extra_seats` is ADDITIVE over the plan's own allowance (the limit helper
 * computes plan + extra), so we store the purchased extras exactly as
 * configured at checkout — not the total seat count, which would
 * double-count the seats the plan already includes.
 */
async function applySubscription(
  workspaceId: string,
  sub: StripeSubscription,
  meta: Record<string, string>
): Promise<void> {
  await setWorkspaceSubscription(workspaceId, {
    plan: meta.plan_key ?? 'free',
    planCycle: meta.cycle,
    planStatus: sub.status,
    purchasedProfiles: intOrNull(meta.profile_quota),
    extraSeats: intOrNull(meta.seat_quota) ?? 0,
    stripeCustomerId: sub.customer,
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false
  })
}

/**
 * Keep quota in step with the live subscription — upgrades, downgrades,
 * cancellations, and recoveries all arrive here.
 *
 * Quantities come from the subscription items, not the original checkout
 * metadata, so a change made in the billing portal is reflected too.
 */
async function onSubscriptionUpdated(event: StripeEvent): Promise<void> {
  const sub = event.data.object as unknown as StripeSubscription
  if (!isOurs(sub.metadata)) return

  const workspace = await resolveWorkspace(sub)
  if (!workspace) return

  if (!isLive(sub.status)) {
    // past_due keeps access (Stripe is still retrying); anything terminal
    // revokes it — but only if THIS subscription is still the active one.
    if (isCurrent(workspace, sub)) await revoke(workspace.id)
    return
  }

  await applySubscription(workspace.id, sub, sub.metadata)
}

async function onSubscriptionDeleted(event: StripeEvent): Promise<void> {
  const sub = event.data.object as unknown as StripeSubscription
  if (!isOurs(sub.metadata)) return

  const workspace = await resolveWorkspace(sub)
  if (!workspace) return

  // Only the CURRENT subscription's cancellation revokes anything.
  //
  // Stripe delivers webhooks asynchronously and out of order, so an upgrade
  // (cancel old → buy new) can deliver the old subscription's `deleted`
  // event AFTER the new one's `completed`. Revoking unconditionally would
  // then wipe the entitlement the customer just paid for — observed in
  // testing when a Starter cancellation landed after a Team purchase.
  if (!isCurrent(workspace, sub)) return

  await revoke(workspace.id)
}

/** The workspace a subscription belongs to, by attachment then by metadata. */
async function resolveWorkspace(
  sub: StripeSubscription
): Promise<{ id: string; stripe_subscription_id: string | null } | null> {
  const attached = await getWorkspaceBySubscription(sub.id)
  if (attached) return attached
  return sub.metadata.workspace_id ? await getWorkspace(sub.metadata.workspace_id) : null
}

/**
 * Is this subscription the one the workspace is currently entitled by?
 *
 * A null column means nothing is attached, so there is nothing to revoke
 * either — treat that as "not current" and leave the row alone.
 */
function isCurrent(
  workspace: { stripe_subscription_id: string | null },
  sub: StripeSubscription
): boolean {
  return workspace.stripe_subscription_id === sub.id
}

/**
 * Drop the purchased quota, returning the workspace to its plan-table limit.
 *
 * Deliberately does NOT delete profiles over the new limit: the enforce_*
 * triggers block new inserts, and existing data stays intact so a customer
 * who resubscribes finds their work. Deleting a paying-then-lapsed
 * customer's profiles would be destructive and unrecoverable.
 */
async function revoke(workspaceId: string): Promise<void> {
  await setWorkspaceSubscription(workspaceId, {
    plan: 'free',
    planStatus: 'canceled',
    // null (not 0) because the profile helper uses greatest(purchased, plan)
    // — null means "no override", while 0 would work but reads as a
    // deliberate zero. Seats are additive, so 0 is the correct clear.
    purchasedProfiles: null,
    extraSeats: 0,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false
  })
}

/** Statuses that should keep the customer's access. */
function isLive(status: string): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

function intOrNull(v: string | undefined): number | null {
  if (v === undefined) return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}
