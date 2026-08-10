// Canonical pricing math for TubeGhost profile plans.
//
// Mirrors TubeGhostMarketing/app/lib/pricing.ts — the marketing site and this
// app MUST agree on every number, or the price quoted on the pricing page
// won't match what Stripe charges. Anchors: 25=$40 · 50=$63 · 100=$89 ·
// 200=$134 · 500=$249 · 1000=$374 (verified in pricing.test.ts).
//
// Dependency-free by design: imported by the renderer AND by the serverless
// checkout/webhook under api/. Add no imports here.
//
// Stripe holds the authoritative amounts. Everything here is for display and
// for validating a requested quantity before creating a session — never for
// computing what to charge.

export type Cycle = 'monthly' | 'quarterly' | 'annual'

/** Billing-cycle multipliers applied to the monthly list price. */
export const CYCLE_MULT: Record<Cycle, number> = {
  monthly: 1,
  quarterly: 0.9, // −10%
  annual: 10 / 12 // 2 months free
}

/** [cap, ratePerUnitUpToCap] — graduated bands, like tax brackets. */
export type Tier = [number, number]

/**
 * Cumulative / graduated profile bands. Each band's rate applies ONLY to the
 * units inside it — NOT a flat rate at volume.
 *
 * This must be created in Stripe as a GRADUATED price, not Volume. Volume
 * would apply the top band's rate to every unit: 1000 profiles would bill
 * $250 instead of $374.
 */
export const PF_CUM_TIERS: Tier[] = [
  [25, 1.6],
  [50, 0.92],
  [100, 0.52],
  [300, 0.45],
  [500, 0.35],
  [1000, 0.25]
]

/** Per team member, per month. Flat — no volume tiers. */
export const SEAT_RATE = 2.5

/** Starter plan base: 10 profiles, 1 seat, fixed. */
export const STARTER_BASE = 19
export const STARTER_PROFILES = 10
export const STARTER_SEATS = 1

/** Profile-count bounds for the Team plan. Above PF_MAX is a sales call. */
export const PF_MIN = 25
export const PF_MAX = 1000

/** Breakpoints the Team profile stepper hops through. */
export const PF_STOPS = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]

/** Walks the graduated bands and returns the monthly profile cost. */
export function pfPrice(profiles: number): number {
  let total = 0
  let prev = 0
  for (const [cap, r] of PF_CUM_TIERS) {
    if (profiles <= prev) break
    total += (Math.min(profiles, cap) - prev) * r
    prev = cap
  }
  return total
}

/** Team monthly list price: graduated profiles + flat seats. */
export function teamList(profiles: number, seats: number): number {
  return pfPrice(profiles) + seats * SEAT_RATE
}

/** Applies the billing-cycle discount to a monthly list price. */
export function applyCycle(list: number, cycle: Cycle): number {
  return list * CYCLE_MULT[cycle]
}

/**
 * Effective per-profile rate, derived for display only — never an input.
 * Returns 0 at zero profiles rather than NaN.
 */
export function perProfileRate(profiles: number): number {
  return profiles > 0 ? pfPrice(profiles) / profiles : 0
}

/**
 * Total charged per billing event: 12× monthly on annual, 3× on quarterly,
 * 0 on monthly (surfaces render "billed monthly" instead).
 */
export function billedTotal(monthly: number, cycle: Cycle): number {
  return cycle === 'annual' ? monthly * 12 : cycle === 'quarterly' ? monthly * 3 : 0
}

/**
 * Currency formatting. Rounds to cents, then drops cents on whole numbers —
 * `$89/mo` but `$74.17/mo`. The ONLY currency formatter; never render a raw
 * float.
 */
export function money(v: number): string {
  return (
    '$' +
    (Math.round(v * 100) / 100).toLocaleString('en-US', {
      minimumFractionDigits: v % 1 ? 2 : 0,
      maximumFractionDigits: 2
    })
  )
}

// ── Plan identity ───────────────────────────────────────────────────

/** TubeGhost plan keys. Distinct from TubeProxies' proxy plan names. */
export type GhostPlanKey = 'starter' | 'team'

export function isCycle(v: unknown): v is Cycle {
  return v === 'monthly' || v === 'quarterly' || v === 'annual'
}

export function isGhostPlanKey(v: unknown): v is GhostPlanKey {
  return v === 'starter' || v === 'team'
}

/**
 * Validate a requested Team configuration. Returns an error string, or null
 * when acceptable. Shared by the UI (to disable the button) and the checkout
 * endpoint (to reject a tampered request) so both agree on what's valid.
 */
export function validateTeamConfig(profiles: number, seats: number): string | null {
  if (!Number.isInteger(profiles)) return 'Profile count must be a whole number'
  if (!Number.isInteger(seats)) return 'Seat count must be a whole number'
  if (profiles < PF_MIN) return `Team starts at ${PF_MIN} profiles`
  if (profiles > PF_MAX) return `Above ${PF_MAX} profiles, please contact sales`
  if (seats < 0) return 'Seat count cannot be negative'
  if (seats > PF_MAX) return 'Seat count is out of range'
  return null
}
