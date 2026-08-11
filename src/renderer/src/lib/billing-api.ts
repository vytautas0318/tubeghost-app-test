// Client for the TubeGhost billing endpoints under /api/billing.
//
// Profile plans are sold by TubeGhost itself (unlike proxies and phone
// numbers, which hand off to the TubeProxies dashboard — see
// lib/tubeproxies-checkout.ts). Both ultimately reach the same Stripe
// account; only the purchase surface differs.

import { getSupabase } from './supabase'
import type { Cycle, GhostPlanKey } from '@shared/pricing'

/** Endpoints authenticate with the Supabase access token the SPA already holds. */
async function authHeaders(): Promise<HeadersInit> {
  const client = getSupabase()
  if (!client) throw new Error('Not signed in')
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

interface ApiError {
  error: string
  detail?: string
}

/** Map an endpoint's error code to something worth showing a user. */
function messageFor(status: number, body: ApiError): string {
  switch (body.error) {
    case 'billing_not_configured':
    case 'prices_not_configured':
      return 'Billing is not set up yet. Please try again shortly.'
    case 'subscription_exists':
      return 'You already have a plan. Use "Manage billing" to change it.'
    case 'not_workspace_owner':
      return 'Only the workspace owner can change the plan.'
    case 'invalid_quantity':
      return body.detail ?? 'That plan size is not available.'
    case 'unauthorized':
      return 'Please sign in again.'
    default:
      return body.detail ?? `Something went wrong (${status}).`
  }
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body ?? {})
  })
  const json = (await res.json().catch(() => ({}))) as T & ApiError
  if (!res.ok) throw new Error(messageFor(res.status, json))
  return json
}

export interface CheckoutRequest {
  workspaceId: string
  plan: GhostPlanKey
  cycle: Cycle
  /** Team only — ignored for Starter, which has fixed allowances. */
  profiles?: number
  /** Additional seats beyond the owner's. Team only. */
  seats?: number
  /**
   * True when proxy / phone steps follow this one. Changes only the Stripe
   * return URL, so the order runner picks the sequence back up instead of
   * ending on the Billing page — without it the customer gets their plan and
   * nothing else.
   *
   * Proxies and numbers are NOT sent here: they are separate Checkout
   * sessions (one subscription per session), created by /api/billing/order.
   */
  partOfOrder?: boolean
}

/**
 * Create a Checkout session and hand the browser to Stripe.
 *
 * Navigates the current tab rather than opening a new one: returning from
 * payment should land the user back where they started, and popup blockers
 * fire on window.open after an await.
 */
export async function startCheckout(req: CheckoutRequest): Promise<void> {
  const { url } = await post<{ url: string }>('/api/billing/checkout', req)
  window.location.assign(url)
}

/**
 * Buy everything in one checkout.
 *
 * Stripe collects the card ONCE without charging; the webhook then creates a
 * subscription per product. One page, one total — the three-page sequence is
 * gone.
 *
 * Navigates the current tab rather than opening a new one: returning from
 * payment should land the user back where they started, and popup blockers
 * fire on window.open after an await.
 */
export async function startSingleCheckout(cart: {
  workspaceId: string
  plan: GhostPlanKey
  cycle: Cycle
  profiles: number
  seats: number
  proxies: number
  numbers: number
}): Promise<void> {
  const { url } = await post<{ url: string }>('/api/billing/checkout-single', cart)
  window.location.assign(url)
}

/** Open Stripe's billing portal — plan changes, invoices, payment methods. */
export async function openBillingPortal(): Promise<void> {
  const { url } = await post<{ url: string }>('/api/billing/portal')
  window.location.assign(url)
}
