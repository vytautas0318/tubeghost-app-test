// Phone-number tiers, mirrored from TubeProxies.
//
// Source of truth: tubeproxies-dash/src/lib/phone-plans.ts. TubeProxies
// provisions and bills these numbers; we only display the ladder so the user
// knows the price before being handed off to its checkout.
//
// Keep `quantity` and `monthlyPrice` in step with that file — a mismatch
// means we quote one price and Stripe charges another.

export interface PhoneTier {
  quantity: number
  /** Total monthly cost for the tier. */
  monthlyPrice: number
  /** Effective per-number price, for the "/ea" display. */
  pricePerNumber: number
  /** 0 for the 1-pack. */
  discountPercent: number
  popular?: boolean
}

export const PHONE_TIERS: PhoneTier[] = [
  { quantity: 1, monthlyPrice: 14.99, pricePerNumber: 14.99, discountPercent: 0 },
  { quantity: 3, monthlyPrice: 39.99, pricePerNumber: 13.33, discountPercent: 11, popular: true },
  { quantity: 7, monthlyPrice: 90.93, pricePerNumber: 12.99, discountPercent: 13 },
  { quantity: 15, monthlyPrice: 187.35, pricePerNumber: 12.49, discountPercent: 17 }
]

/** Quarterly is 10% off, matching the proxy ladder and TubeProxies' cycles. */
export const PHONE_QUARTERLY_MULT = 0.9

/** Above this, TubeProxies handles the order manually. */
export const PHONE_MAX_SELF_SERVICE = 50

/**
 * Numbers needed before team sharing unlocks.
 *
 * 7, matching TubeProxies' enforce_phone_team_seat_limit() ("at least 7
 * numbers to add team members"), which gates on the SUBSCRIPTION quantity.
 * Promising unlock at a lower number would send users to a purchase the
 * backend then rejects.
 */
export const PHONE_TEAM_SHARING_MIN = 7
