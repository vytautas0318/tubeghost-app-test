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
/**
 * Billing-cycle multipliers applied to the monthly list price.
 *
 * Annual is a flat −20%, matching proxies and phone numbers on TubeProxies
 * (Julian, 2026-08-14: "Maybe we can change it to 20% off … so everything is
 * consistent. Because annual for proxies + phone numbers is 20% off").
 *
 * It was 10/12 — literal "2 months free", ≈ −16.7% — which made a plan's annual
 * term a weaker discount than the add-ons sitting on the same card. One rate
 * across plans and add-ons is what keeps a mixed basket explicable.
 * tubeproxies-dash agrees: ANNUAL_DISCOUNT = 0.20.
 *
 * Annual is charged UPFRONT for the full year; the discount is expressed in the
 * price, not in skipped months.
 */
export const CYCLE_MULT: Record<Cycle, number> = {
  monthly: 1,
  quarterly: 0.9, // −10%
  annual: 0.8 // −20%
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

/** Starter monthly list price: fixed base + per-unit add-ons. */
export function starterList(proxies: number, numbers: number): number {
  return (
    STARTER_BASE + proxies * rate(PROXY_TIERS, proxies) + numbers * rate(PHONE_TIERS, numbers)
  )
}

/** Team monthly list price: graduated profiles + seats + per-unit add-ons. */
export function teamList(
  profiles: number,
  seats: number,
  proxies: number,
  numbers: number
): number {
  return (
    pfPrice(profiles) +
    seats * SEAT_RATE +
    proxies * rate(PROXY_TIERS, proxies) +
    numbers * rate(PHONE_TIERS, numbers)
  )
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

/** Every TubeGhost plan, including the free tier a new workspace starts on. */
export type PlanKey = 'free' | 'starter' | 'team'

/**
 * The PAID TubeGhost plans. Distinct from TubeProxies' proxy plan names, and
 * deliberately excludes 'free': a free workspace can never be the target of a
 * checkout, so anything on that path narrows to this instead of PlanKey.
 */
export type GhostPlanKey = Exclude<PlanKey, 'free'>

export function isCycle(v: unknown): v is Cycle {
  return v === 'monthly' || v === 'quarterly' || v === 'annual'
}

/**
 * Narrow a raw `workspaces.plan_cycle` value to a Cycle, defaulting to
 * monthly. Used wherever the DB column is read — a bare
 * `x === 'quarterly' ? … : 'monthly'` silently mis-prices annual
 * subscriptions as monthly, which is exactly the bug this prevents.
 */
export function readCycle(v: unknown): Cycle {
  return isCycle(v) ? v : 'monthly'
}

export function isGhostPlanKey(v: unknown): v is GhostPlanKey {
  return v === 'starter' || v === 'team'
}

/**
 * MASTER SWITCH for offering TubeProxies products alongside a TubeGhost plan.
 *
 * Each product gets its OWN Checkout session (Stripe allows one subscription
 * per session, and the three products are recorded in three tables that each
 * require a unique stripe_subscription_id). The proxy and phone sessions
 * carry TubeProxies' own metadata keys — `type: 'phone_number'`,
 * `proxy_count`, `plan_name` — so their existing webhook dispatcher should
 * route and provision them with no change on their side.
 *
 * ⚠️ "Should" is not "does". This has NOT been confirmed against a real
 * purchase. Until it is, the failure mode is that the customer is charged and
 * receives nothing, silently.
 *
 * BEFORE ENABLING IN PRODUCTION, verify in TEST MODE that a bundled order
 * actually provisions:
 *
 *   select plan_name, proxy_limit, status from public.subscriptions
 *     where user_id = '<uid>';
 *   select count(*) from public.proxies where user_id = '<uid>';
 *
 * A missing subscriptions row means their dispatcher rejected our session and
 * the dash side needs a change after all.
 *
 * Also requires TubeProxies' price IDs in this app's environment
 * (NEXT_PUBLIC_PRICE_GROWTH_MONTHLY, NEXT_PUBLIC_PRICE_PHONE_QTY_3, …);
 * without them checkout reports the bundle as unavailable.
 */
export const ADDONS_IN_CHECKOUT_ENABLED = true

/**
 * Can proxies and phone numbers be bought in the same checkout as the plan?
 *
 * Two independent conditions:
 *
 *  1. The master switch above — is the provisioning side ready at all?
 *  2. The cycle. Every line item in one Stripe Checkout session must share a
 *     billing interval, and TubeProxies sells proxies/numbers on MONTHLY and
 *     QUARTERLY only. So an annual plan can never bundle them, even once the
 *     switch is on (client decision, 2026-08-10) — an annual customer buys
 *     them separately from the Buy proxies / Phone pages, which work today.
 */
export function addOnsAvailable(cycle: Cycle): boolean {
  return ADDONS_IN_CHECKOUT_ENABLED && cycle !== 'annual'
}

export interface PlanDef {
  key: PlanKey
  name: string
  /** Fixed base price. Team is null — its profiles are graduated. */
  base: number | null
  /** Profiles included. On Team this is the configurator's FLOOR (PF_MIN). */
  profiles: number
  /** True when the buyer picks their own profile count (Team only). */
  configurableProfiles: boolean
  /** Members included in the price. Extra seats bill at SEAT_RATE. */
  seatsIncluded: number
  /** Whether seats beyond `seatsIncluded` can be bought at all. */
  extraSeats: boolean
}

/**
 * The plans TubeGhost sells — mirrors TubeGhostMarketing/app/lib/pricing.ts
 * so the app and the site can never quote different prices, and matches
 * ghost.plans (which is what the DB triggers actually enforce).
 *
 * Team bundles 3 members per the client's 2026-08-07 decision — only members
 * beyond those three bill at SEAT_RATE. Starter is solo and sells no seats.
 * Enterprise is sales-led and has no entry.
 */
export const PLANS: Record<PlanKey, PlanDef> = {
  free: {
    key: 'free',
    name: 'Free',
    base: 0,
    // 3, matching ghost.plans — migration 0013 lowered it from the original
    // seed's 5, and the DB is what enforce_profile_limit actually reads.
    profiles: 3,
    configurableProfiles: false,
    seatsIncluded: 1,
    extraSeats: false
  },
  starter: {
    key: 'starter',
    name: 'Starter',
    base: STARTER_BASE,
    profiles: 10,
    configurableProfiles: false,
    seatsIncluded: 1,
    extraSeats: false
  },
  team: {
    key: 'team',
    name: 'Team',
    base: null, // graduated — see pfPrice()
    profiles: PF_MIN,
    configurableProfiles: true,
    seatsIncluded: 3,
    extraSeats: true
  }
}

/**
 * Seats billed on top of the price at this member count.
 *
 * CRITICAL for checkout: ghost.workspace_seat_limit computes
 * `plans.member_seat_limit + workspaces.extra_seats`, so the webhook must
 * store the BILLABLE extras — not the total member count, which would grant
 * the included seats twice.
 */
export function billableSeats(plan: PlanDef, members: number): number {
  if (!plan.extraSeats) return 0
  return Math.max(0, members - plan.seatsIncluded)
}

/**
 * Monthly list price for a plan, before the cycle discount.
 *
 * Team walks the graduated profile bands for the configured count; the fixed
 * plans use their base. Seats beyond those included are added at SEAT_RATE.
 * Proxies and numbers are NOT folded in — they are bought per unit from
 * TubeProxies and billed on their own subscription.
 */
export function planList(
  plan: PlanDef,
  members = plan.seatsIncluded,
  profiles = plan.profiles
): number {
  const profileCost = plan.configurableProfiles ? pfPrice(profiles) : (plan.base ?? 0)
  return profileCost + billableSeats(plan, members) * SEAT_RATE
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

// ── Compatibility aliases for the shared billing components ─────────────────
//
// The billing UI is shared with the desktop app, which imports these names
// from TubeGhostMarketing/app/lib/pricing.ts. Rather than keep a second copy of
// the pricing MATH, they are thin aliases over what this module already
// computes — so there is exactly one implementation of every number.

/** The billing cycles, in ascending commitment order. */
export const PLAN_CYCLES = ['monthly', 'quarterly', 'annual'] as const

/** Alias of `Cycle`, under the name the shared billing components import. */
export type PlanCycle = Cycle

export function isPlanCycle(v: unknown): v is PlanCycle {
  return v === 'monthly' || v === 'quarterly' || v === 'annual'
}

/**
 * Full TubeGhost plan-key guard, including 'free'.
 *
 * Distinct from isGhostPlanKey(), which excludes 'free' because a free
 * workspace can never be the target of a checkout.
 */
export function isPlanKey(v: unknown): v is PlanKey {
  return v === 'free' || v === 'starter' || v === 'team'
}

/** Everything a plan card needs to render one priced option. */
export interface PlanQuote {
  listMonthly: number
  monthly: number
  charged: number
  billableSeats: number
  /** Profiles this quote actually buys — the denominator for perProfile. */
  profiles: number
  /** Effective per-profile rate, for display only. */
  perProfile: number
}

export function planQuote(
  plan: PlanDef,
  cycle: PlanCycle,
  members: number,
  profiles = plan.profiles
): PlanQuote {
  const effectiveProfiles = plan.configurableProfiles
    ? Math.min(PF_MAX, Math.max(PF_MIN, profiles))
    : plan.profiles
  const listMonthly = planList(plan, members, effectiveProfiles)
  const monthly = applyCycle(listMonthly, cycle)
  return {
    listMonthly,
    monthly,
    charged: cycle === 'annual' ? monthly * 12 : cycle === 'quarterly' ? monthly * 3 : monthly,
    billableSeats: billableSeats(plan, members),
    profiles: effectiveProfiles,
    perProfile: plan.configurableProfiles ? perProfileRate(effectiveProfiles) : 0
  }
}

// ── TubeProxies add-on pricing (proxies + phone numbers) ────────────────────
//
// These are TubeProxies' numbers, not TubeGhost's: the same threshold rates
// tubeproxies-dash sells from (dash/src/lib/plans.ts — e.g. Hobby $39 for 5 IPs
// = $7.80/IP, matching [5, 7.8] below). Duplicated here only because the
// Billing UI needs them client-side; the checkout Edge Function re-computes
// every total server-side and refuses a mismatched client quote, so a drift
// here surfaces loudly rather than mischarging.

/** Proxy quantities the stepper offers — the pack sizes TubeProxies sells. */
export const PX_STOPS = [0, 1, 5, 10, 25, 50, 100]

/** Snap an arbitrary proxy count to the nearest sellable pack size. */
export function snapProxyQty(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return PX_STOPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), PX_STOPS[0])
}

/**
 * Phone quantities the stepper offers — the ladder TubeProxies sells.
 *
 * Only these have tile prices. A stepper moving by 1 could quote 2 or 4
 * numbers, which no tile covers: on the live account those fall back to a
 * per-unit price plus a volume coupon whose percentage only approximates the
 * ladder rate, so the quoted total would not be the charged total.
 */
export const PHONE_STOPS = [0, 1, 3, 7, 15]

/** Snap an arbitrary number count to the nearest sellable ladder size. */
export function snapPhoneQty(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return PHONE_STOPS.reduce(
    (best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best),
    PHONE_STOPS[0]
  )
}

/** Threshold rates: the whole pack bills at the rate its size unlocks. */
export const PROXY_TIERS: Tier[] = [
  [100, 5],
  [50, 6.5],
  [25, 7],
  [10, 7.5],
  [5, 7.8],
  [1, 8]
]

export const PHONE_TIERS: Tier[] = [
  [15, 12.49],
  [7, 12.99],
  [3, 13.33],
  [1, 14.99]
]

/** First tier whose threshold the quantity reaches. */
export function rate(tiers: Tier[], qty: number): number {
  for (const [q, r] of tiers) if (qty >= q) return r
  return tiers[tiers.length - 1][1]
}

/**
 * Cycle multipliers for ADD-ONS (proxies + phone), which discount on a
 * different ladder from workspace plans: quarterly -10%, annual -20%.
 */
export const ADDON_CYCLE_MULT: Record<Cycle, number> = {
  monthly: 1,
  quarterly: 0.9,
  annual: 0.8
}
