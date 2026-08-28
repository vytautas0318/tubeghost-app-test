// Shared types for the Billing page. Kept separate from the hook so the
// upgrade modal and the tab components can import them without pulling in
// Supabase query code.

import type { PlanCycle } from '@shared/pricing'

export type PlanStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'

export interface BillingPlan {
  /** plan_key from ghost.plans — 'free' | 'pro' | 'team'. */
  id: string
  name: string
  /** Effective seat cap: seatsIncluded + extraSeats, matching the DB trigger. */
  seats: number | null
  /** Seats bundled in the flat price (plans.member_seat_limit). */
  seatsIncluded: number | null
  /** Seats purchased on top, webhook-owned (workspaces.extra_seats). */
  extraSeats: number
  /** Profile cap from plans.profile_limit — enforced by a DB trigger. */
  profileLimit: number | null
  /**
   * Monthly price being paid: the plan's flat price plus purchased seats,
   * after the cycle discount. Plans are flat per workspace — capacity is what
   * you buy, so this does not vary with usage.
   */
  priceMonthly: number
  cycle: PlanCycle
  status: PlanStatus
  /** ISO timestamp the current period renews/ends, or null on free. */
  currentPeriodEnd: string | null
  /** True when cancelled but still running out the paid period. */
  cancelAtPeriodEnd: boolean
}

/**
 * Live usage counts. A count is `null` when its query failed — rendered as
 * "—" rather than 0, so a permissions or network error never masquerades as a
 * confident zero. Each is counted independently, so one failing does not
 * discard the others.
 */
export interface BillingUsage {
  profilesUsed: number | null
  profileLimit: number | null
  seatsUsed: number | null
  seatLimit: number | null
  /** Count only — proxies are not capped by plan. */
  proxiesInPool: number | null
  phoneNumbers: number
}

export interface PaymentMethod {
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

export interface Invoice {
  id: string
  date: string
  description: string
  amount: number
  status: 'paid' | 'open' | 'void' | 'uncollectible'
  downloadUrl: string | null
}

/**
 * Per-section load state. The page renders each card independently so one
 * failing query never blanks the whole page.
 */
export interface Section<T> {
  data: T
  loading: boolean
  error: string | null
}

export interface BillingState {
  plan: Section<BillingPlan | null>
  usage: Section<BillingUsage>
  paymentMethod: Section<PaymentMethod | null>
  billingEmail: string
  invoices: Section<Invoice[]>
  /** Re-runs every query. */
  refresh: () => void
}
