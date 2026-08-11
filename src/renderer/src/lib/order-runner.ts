// Drives a multi-product purchase through its Stripe Checkouts.
//
// One session can only create one subscription (Stripe rejects per-line-item
// `subscription_data`), and the plan, proxies and numbers each need their own
// — so an order runs as a short sequence of redirects. The user configures
// everything once and clicks Buy once; the steps then chain themselves.
//
// State lives in sessionStorage because Stripe navigates away from the app
// between steps, so in-memory state would be lost. It is deliberately NOT
// persisted server-side: a half-finished order is not something worth
// reconciling later, and each completed step is already durable on its own
// (its own subscription, its own webhook).

import type { Order, OrderStepKind } from '@shared/order'
import { startCheckout } from './billing-api'
import { getSupabase } from './supabase'

const KEY = 'tg-pending-order'

interface Pending {
  order: Order
  completed: OrderStepKind[]
}

function load(): Pending | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Pending) : null
  } catch {
    return null
  }
}

function save(p: Pending): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable — the order simply won't resume */
  }
}

export function clearPendingOrder(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** A pending order's remaining steps, for the resume banner. */
export function pendingOrder(): Pending | null {
  const p = load()
  if (!p) return null
  const total = 1 + (p.order.proxies ? 1 : 0) + (p.order.numbers ? 1 : 0)
  return p.completed.length >= total ? null : p
}

async function authHeaders(): Promise<HeadersInit> {
  const client = getSupabase()
  if (!client) throw new Error('Not signed in')
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

interface StepResponse {
  done?: boolean
  step?: OrderStepKind
  url?: string
  usePlanCheckout?: boolean
  error?: string
  detail?: string
}

/**
 * Run the next step of an order, redirecting to Stripe.
 *
 * Returns only when the order is complete — otherwise the browser navigates
 * away. Call again on return from Stripe to continue.
 */
export async function runOrder(order: Order, completed: OrderStepKind[] = []): Promise<void> {
  save({ order, completed })

  const res = await fetch('/api/billing/order', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ order, completed })
  })
  const json = (await res.json().catch(() => ({}))) as StepResponse
  if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Could not continue the order.')

  if (json.done) {
    clearPendingOrder()
    return
  }

  // The plan step reuses the normal checkout endpoint, which owns the plan's
  // validation, pricing and metadata.
  if (json.usePlanCheckout) {
    // Tell checkout whether anything follows, so it returns to a URL that
    // continues the order instead of ending on the Billing page.
    const hasMoreSteps = order.proxies > 0 || order.numbers > 0
    await startCheckout({
      workspaceId: order.workspaceId,
      plan: order.plan,
      cycle: order.cycle,
      profiles: order.profiles,
      seats: order.seats,
      partOfOrder: hasMoreSteps
    })
    return
  }

  if (!json.url) throw new Error('Stripe did not return a checkout URL.')
  window.location.assign(json.url)
}

/**
 * Continue an order after returning from Stripe.
 *
 * `justCompleted` is the step whose payment just succeeded — read from the
 * return URL rather than assumed, so a refresh cannot double-count.
 */
export async function resumeOrder(justCompleted: OrderStepKind[]): Promise<void> {
  const p = load()
  if (!p) return
  const completed = Array.from(new Set([...p.completed, ...justCompleted]))
  await runOrder(p.order, completed)
}
