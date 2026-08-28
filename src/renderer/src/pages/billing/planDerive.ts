// Deriving the plan figures actually in force from the DB rows.
//
// Split from useBilling to keep that file under the 250-line limit, and so the
// same maths is importable by any other billing surface.
//
// ⚠ Plans are GRADUATED: `plans.monthly_price_usd` and `plans.profile_limit`
// are only the plan's FLOOR. A Team workspace that bought 500 profiles pays
// from the graduated bands and is capped at what it purchased, so reading the
// plan row alone reports both the wrong price and the wrong cap.

import { PLANS, isPlanKey, planQuote, readCycle, type PlanCycle } from '@shared/pricing'

export interface PlanRow {
  plan_key: string
  display_name: string | null
  profile_limit: number | null
  member_seat_limit: number | null
  monthly_price_usd: number | null
}

/** Subscription state, webhook-owned columns on the workspace row. */
export interface SubRow {
  plan_cycle: string | null
  plan_status: string | null
  extra_seats: number | null
  purchased_profiles: number | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
}

/**
 * Monthly price actually being paid, recomputed through the shared pricing
 * module so it can never disagree with the upgrade modal or checkout.
 *
 * Team is graduated, so the price depends on the PURCHASED profile capacity —
 * `plans.monthly_price_usd` is only the plan's floor and must not be used as
 * the price for a configured workspace.
 */
export function derivePrice(row: PlanRow | null, sub: SubRow | null): number {
  const key = row?.plan_key
  if (!isPlanKey(key)) return row?.monthly_price_usd ?? 0
  const plan = PLANS[key]
  const cycle: PlanCycle = readCycle(sub?.plan_cycle)
  const members = plan.seatsIncluded + (sub?.extra_seats ?? 0)
  const profiles = sub?.purchased_profiles ?? plan.profiles
  return planQuote(plan, cycle, members, profiles).monthly
}

/** Effective profile cap: purchased capacity, else the plan's included count. */
export function deriveProfileLimit(row: PlanRow | null, sub: SubRow | null): number | null {
  const purchased = sub?.purchased_profiles
  if (purchased != null && purchased > 0) return purchased
  return row?.profile_limit ?? null
}
