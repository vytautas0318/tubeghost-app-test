// POST /api/billing/portal — open Stripe's billing portal.
//
// Plan changes, cancellation, payment-method updates and invoice history all
// live there rather than being reimplemented here. Because one Stripe account
// serves both products, the portal also shows the customer's TubeProxies
// subscriptions — which is the desired outcome: one place for all billing.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from '../../session.js'
import { createPortalSession, findOrCreateCustomer, StripeError } from '../../stripe.js'
import { stripeConfigured } from '../../stripe-env.js'
import { PUBLIC_BASE_URL } from '../../env.js'

export default async function portal(req: VercelRequest, res: VercelResponse): Promise<void> {
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

  try {
    // Same lookup as checkout, so the portal opens on the customer record
    // the user already has — including one created by TubeProxies.
    const customer = await findOrCreateCustomer(session.email, session.userId)
    const { url } = await createPortalSession(customer, `${PUBLIC_BASE_URL}/billing`)
    res.status(200).json({ url })
  } catch (err) {
    if (err instanceof StripeError) {
      res.status(502).json({ error: 'stripe_error', detail: err.message })
      return
    }
    res.status(500).json({ error: 'portal_failed' })
  }
}
