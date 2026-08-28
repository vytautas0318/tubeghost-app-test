// Phone quantity/cycle change calls against the phone-checkout edge function.
//
// Mirrors tubeproxies-dash's QuantityChangeModal flow: PREVIEW first, show the
// user exactly what they will be charged, and only mutate after an explicit
// confirm. The dash posts to /api/phone-numbers/preview-quantity-change then
// /upgrade or /downgrade; the edge function exposes the same two steps as
// actions on one function, so the app never leaves for the dashboard.
//
// Both steps classify server-side through the SAME getPhoneQuantityAction, so
// a preview saying "$0 today, effective Sep 30" can never be followed by an
// immediate charge.

import { getSupabase } from '@/lib/supabase'
import type { PhoneBillingPeriod } from './phoneCheckout'

export interface PhoneChangePreview {
  test_mode: boolean
  kind: 'upgrade' | 'downgrade' | 'select' | 'unavailable'
  timing: 'immediate' | 'period_end' | 'none'
  isDowngrade: boolean
  isIntervalOnly: boolean
  requiresNumberSelection: boolean
  numbersToRelease: number
  current: { quantity: number; billingPeriod: PhoneBillingPeriod | null }
  next: { quantity: number; billingPeriod: PhoneBillingPeriod }
  quantityDelta: number
  /** Set for scheduled downgrades; null when the change applies now. */
  effectiveDate: string | null
  /** Stripe's amount_due — exactly what will be charged. 0 for downgrades. */
  chargedToday: number
  subtotal: number
  tax: number
  taxPercent: number
}

export type PhoneChangeResult =
  | {
      success: true
      scheduled: boolean
      isIntervalOnly: boolean
      effectiveDate?: string
      newQuantity: number
      message: string
    }
  // The prorated invoice needs authorising (3DS/SCA). Reporting success here
  // would claim money moved when it has not.
  | { success: false; requiresPayment: true; redirect_url: string; invoice_id: string }

/** A refusal the user must see and act on, not a transient failure. */
export class PhoneChangeRefused extends Error {}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const c = getSupabase()
  if (!c) throw new Error('Not signed in')
  const { data, error } = await c.functions.invoke<T & { error?: string }>('phone-checkout', {
    body
  })
  if (error) {
    // supabase-js reports any non-2xx as `error` with the body unparsed, so
    // read the server's message off the response rather than surfacing a bare
    // "non-2xx status code".
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = (await ctx.json()) as { error?: string }
        if (parsed?.error) {
          // 400/409 are decisions (already on this quantity, needs selection),
          // not glitches — the user needs to read them.
          if (ctx.status === 400 || ctx.status === 409) throw new PhoneChangeRefused(parsed.error)
          throw new Error(parsed.error)
        }
      } catch (e) {
        if (e instanceof PhoneChangeRefused) throw e
      }
    }
    throw new Error(error.message)
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new PhoneChangeRefused(String(data.error))
  }
  return data as T
}

/** Read-only. Mutates nothing — safe to call before the user commits. */
export async function previewPhoneChange(
  quantity: number,
  period: PhoneBillingPeriod
): Promise<PhoneChangePreview> {
  return invoke<PhoneChangePreview>({
    action: 'preview-quantity-change',
    quantity,
    billing_period: period
  })
}

/**
 * MUTATING. Only call after the user has confirmed a preview.
 *
 * `numberIdsToRelease` is required only when the count actually falls; a
 * cycle-only change keeps every number and sends an empty list.
 */
export async function commitPhoneChange(
  quantity: number,
  period: PhoneBillingPeriod,
  numberIdsToRelease: string[] = []
): Promise<PhoneChangeResult> {
  return invoke<PhoneChangeResult>({
    action: 'change-quantity',
    quantity,
    billing_period: period,
    phone_number_ids_to_release: numberIdsToRelease
  })
}
