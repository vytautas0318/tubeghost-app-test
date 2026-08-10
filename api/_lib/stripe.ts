// Minimal Stripe REST client.
//
// Mirrors the thin `rest()` helpers in _lib/db.ts and _lib/handoff.ts rather
// than adding the `stripe` SDK: we make three calls (create customer, list
// customers, create checkout session) plus one signature verification. The
// SDK is ~1MB of cold-start weight for that.
//
// Stripe's API is form-encoded, not JSON, including nested params — hence
// the bracket flattening in `form()`.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { automaticTaxEnabled, STRIPE_SECRET_KEY } from './stripe-env.js'

const API = 'https://api.stripe.com/v1'

/** Anything Stripe's form encoder accepts, nested arbitrarily deep. */
type FormValue = string | number | boolean | null | undefined | FormShape | FormValue[]
interface FormShape {
  [k: string]: FormValue
}

/**
 * Flatten a nested object into Stripe's bracket notation:
 *   { metadata: { a: 1 }, line_items: [{ price: 'p' }] }
 *   → metadata[a]=1 & line_items[0][price]=p
 * Undefined and null are omitted so callers can pass optional fields inline.
 */
function form(obj: FormShape, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') form(item as FormShape, `${key}[${i}]`, out)
        else out.append(`${key}[${i}]`, String(item))
      })
    } else if (typeof v === 'object') {
      form(v as FormShape, key, out)
    } else {
      out.append(key, String(v))
    }
  }
  return out
}

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
    this.name = 'StripeError'
  }
}

async function call<T>(path: string, body?: FormShape, method = 'POST'): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body ? form(body).toString() : undefined
  })
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string }
  }
  if (!res.ok) {
    throw new StripeError(
      json.error?.message ?? `Stripe ${res.status}`,
      res.status,
      json.error?.code
    )
  }
  return json as T
}

// ── Customers ──────────────────────────────────────────────────────

export interface StripeCustomer {
  id: string
}

/**
 * Find an existing customer by email, or create one.
 *
 * Reuse matters here: the same person may already be a TubeProxies customer
 * in this account (the dashboard does the identical lookup). Creating a
 * second customer would split their billing history and payment methods —
 * exactly the duplication the single-account decision exists to avoid.
 */
export async function findOrCreateCustomer(
  email: string,
  supabaseUserId: string
): Promise<string> {
  const found = await call<{ data: StripeCustomer[] }>(
    `/customers?email=${encodeURIComponent(email)}&limit=1`,
    undefined,
    'GET'
  )
  if (found.data.length > 0) return found.data[0].id

  const created = await call<StripeCustomer>('/customers', {
    email,
    metadata: { supabase_user_id: supabaseUserId }
  })
  return created.id
}

// ── Checkout ───────────────────────────────────────────────────────

export interface CheckoutSession {
  id: string
  url: string | null
}

// A type alias, not an interface: interfaces have no implicit index
// signature, so `LineItem[]` would not satisfy the FormValue constraint the
// form encoder needs.
export type LineItem = {
  price: string
  quantity: number
}

export async function createCheckoutSession(params: {
  customer: string
  lineItems: LineItem[]
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
}): Promise<CheckoutSession> {
  // Off only when explicitly opted out AND on a test key — see
  // automaticTaxEnabled(). Production always collects tax.
  const withTax = automaticTaxEnabled()
  return await call<CheckoutSession>('/checkout/sessions', {
    customer: params.customer,
    mode: 'subscription',
    line_items: params.lineItems,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: withTax },
    automatic_tax: { enabled: withTax },
    // `address: 'auto'` writes the entered address back to the customer, which
    // Stripe REQUIRES when automatic tax is on. With tax off there is nothing
    // to compute from, so only sync the name.
    customer_update: withTax ? { address: 'auto', name: 'auto' } : { name: 'auto' },
    metadata: params.metadata,
    // Mirrored onto the subscription so the webhook can read it on renewal
    // events, which carry the subscription but not the session.
    subscription_data: { metadata: params.metadata }
  })
}

// ── Billing portal ─────────────────────────────────────────────────

export async function createPortalSession(
  customer: string,
  returnUrl: string
): Promise<{ url: string }> {
  return await call<{ url: string }>('/billing_portal/sessions', {
    customer,
    return_url: returnUrl
  })
}

// ── Subscriptions ──────────────────────────────────────────────────

export interface StripeSubscriptionItem {
  price: { id: string }
  quantity?: number
  /**
   * Billing period. Lives on the ITEM, not the subscription, since Stripe
   * API 2025-xx (SDK v20+) — reading sub.current_period_end returns
   * undefined and silently stores a null renewal date.
   */
  current_period_start?: number
  current_period_end?: number
}

export interface StripeSubscription {
  id: string
  status: string
  customer: string
  cancel_at_period_end?: boolean
  /** Legacy top-level field — undefined on current API versions. Use
   *  subscriptionPeriodEnd() rather than reading this directly. */
  current_period_end?: number
  items: { data: StripeSubscriptionItem[] }
  metadata: Record<string, string>
}

/**
 * The subscription's period end as a unix timestamp, or null.
 *
 * Reads the first item's period (where Stripe now keeps it) and falls back to
 * the legacy top-level field so older API versions still work.
 */
export function subscriptionPeriodEnd(sub: StripeSubscription): number | null {
  return sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ?? null
}

export async function getSubscription(id: string): Promise<StripeSubscription> {
  return await call<StripeSubscription>(`/subscriptions/${id}`, undefined, 'GET')
}

// ── Webhook signature ──────────────────────────────────────────────

/**
 * Verify Stripe's `Stripe-Signature` header against the RAW request body.
 *
 * Must be the raw bytes — a re-serialised JSON object will not match, which
 * is why the webhook route disables Vercel's body parser.
 *
 * Rejects timestamps outside `toleranceSec` so a captured request can't be
 * replayed later. Fails closed on every error.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  toleranceSec = 300,
  nowMs: number = Date.now()
): boolean {
  if (!header || !secret) return false

  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2)
    if (k?.trim() === 't') timestamp = v?.trim() ?? ''
    else if (k?.trim() === 'v1' && v) signatures.push(v.trim())
  }
  if (!timestamp || signatures.length === 0) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(nowMs / 1000 - ts) > toleranceSec) return false

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')

  // Constant-time compare against each candidate — Stripe sends multiple v1
  // signatures while a webhook secret is being rotated.
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, 'utf8')
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)
  })
}
