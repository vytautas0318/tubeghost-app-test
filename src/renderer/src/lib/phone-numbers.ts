// Data layer for TubeProxies-provisioned phone numbers.
//
// Source of truth is TubeProxies' public.phone_numbers / phone_sms /
// phone_subscriptions — the SAME rows the TubeProxies dashboard shows. Since
// the TubeGhost → TubeProxies DB consolidation there is no TubeGhost-side
// copy: ghost.phone_numbers and ghost.user_phone_numbers were both dropped.
//
// Why an Edge Function rather than a direct .from() read through
// getPublicSchema(): phone_number is encrypted at rest (AES-256-GCM) and
// decrypting needs a server-side key. The `phone-numbers` function does the
// read, decrypt and sanitize — it strips provisioning_ref / billing_cycle_ref
// / service_type, which name the upstream provider and are the white-label
// boundary. It is deployed on the shared project from the desktop repo
// (supabase/functions/phone-numbers/index.ts).
//
// READ-ONLY. Purchase, quantity change and cancellation live on
// dash.tubeproxies.com — see openPhonePurchase().

import { getSupabase } from '@/lib/supabase'

export type PhoneNumberStatus = 'provisioning' | 'active' | 'expired' | 'released' | 'failed'

export interface PhoneNumberRow {
  id: string
  phone_number: string | null
  status: PhoneNumberStatus
  label: string | null
  provisioned_at: string | null
  expires_at: string | null
  created_at: string | null
}

export interface PhoneSmsRow {
  id: string
  phone_number_id: string
  from_number: string | null
  body: string
  parsed_code: string | null
  received_at: string
  // True when the code is withheld because the subscription is past due.
  locked: boolean
}

export interface PhoneSubscription {
  id: string
  status: string
  number_quantity: number
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  // Null for team members — only the billing owner sees these.
  payment_failed_at: string | null
  scheduled_downgrade: { quantity?: number; effective_at?: string } | null
}

export interface PhoneOverview {
  subscription: PhoneSubscription | null
  phone_numbers: PhoneNumberRow[]
  sms: PhoneSmsRow[]
  // False when the caller is a phone-team member rather than the buyer.
  is_owner: boolean
  is_past_due: boolean
}

const EMPTY: PhoneOverview = {
  subscription: null,
  phone_numbers: [],
  sms: [],
  is_owner: false,
  is_past_due: false
}

// Fetch the caller's numbers, SMS and subscription in one round trip.
//
// Returns EMPTY (rather than throwing) when the user simply has no phone
// subscription — that is the normal state for most TubeGhost users and should
// render the empty state, not an error.
export async function getPhoneOverview(): Promise<PhoneOverview> {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured')

  const { data, error } = await c.functions.invoke<PhoneOverview | { error: string }>(
    'phone-numbers',
    { body: {} }
  )
  if (error) throw new Error(error.message)
  if (!data) return EMPTY
  if ('error' in data) throw new Error(data.error)
  return {
    ...EMPTY,
    ...data,
    phone_numbers: data.phone_numbers ?? [],
    sms: data.sms ?? []
  }
}

// Commerce lives on the TubeProxies dashboard. Deep-link rather than
// reimplementing Stripe here — see the desktop repo's
// docs/architecture-decision.md (decision A). The URLs themselves live in
// lib/tubeproxies-checkout.ts alongside the proxy hand-off.
export { openPhoneCheckout as openPhonePurchase } from './tubeproxies-checkout'
