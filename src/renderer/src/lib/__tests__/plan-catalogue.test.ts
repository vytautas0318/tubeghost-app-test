// Tests for the plan catalogue the app sells: the marketing site's GRADUATED
// per-profile model, on all three billing cycles.
//
// One agreed change from the site as originally built (client, 2026-08-07):
// Team bundles 3 members rather than billing every seat from the first. The
// marketing page was updated to match, so both surfaces now quote identically
// — `plan-catalogue-parity.test.ts` proves the client and server halves agree.
//
// The published anchors ARE asserted here (25=$40 · 100=$89 · 1000=$374).
// These are real numbers the site has been quoting since 2 Aug, so a change to
// them is a regression, not an expected update.

import { describe, it, expect } from 'vitest'
import {
  PF_MAX,
  PF_MIN,
  PLANS,
  PLAN_CYCLES,
  SEAT_RATE,
  billableSeats,
  isPlanCycle,
  isPlanKey,
  money,
  pfPrice,
  planList,
  planQuote,
  readCycle
} from '@shared/pricing'

describe('published pricing anchors', () => {
  // These are the numbers on tubeghost.com. If one changes, the marketing page
  // and the app have diverged and customers see two different prices.
  it.each([
    [25, 40],
    [50, 63],
    [100, 89],
    [200, 134],
    [500, 249],
    [1000, 374]
  ])('%i profiles costs $%i/mo', (profiles, expected) => {
    expect(pfPrice(profiles)).toBeCloseTo(expected, 10)
  })

  it('formats whole prices without cents', () => {
    expect(money(pfPrice(100))).toBe('$89')
  })
})

describe('plan catalogue', () => {
  it('sells free, starter and team (Enterprise is sales-led)', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['free', 'starter', 'team'])
  })

  it('fixes Starter at 10 profiles for one operator', () => {
    expect(PLANS.starter.profiles).toBe(10)
    expect(PLANS.starter.base).toBe(19)
    expect(PLANS.starter.configurableProfiles).toBe(false)
    expect(PLANS.starter.extraSeats).toBe(false)
  })

  it('makes Team the configurator, floored at PF_MIN', () => {
    expect(PLANS.team.configurableProfiles).toBe(true)
    expect(PLANS.team.profiles).toBe(PF_MIN)
    // Graduated — there is no single base price to quote.
    expect(PLANS.team.base).toBeNull()
  })

  it('bundles 3 members into Team, as agreed 2026-08-07', () => {
    expect(PLANS.team.seatsIncluded).toBe(3)
    expect(PLANS.team.extraSeats).toBe(true)
  })

  it('rejects the retired pro key', () => {
    expect(isPlanKey('pro')).toBe(false)
    expect(isPlanKey('starter')).toBe(true)
    expect(isPlanKey('enterprise')).toBe(false)
  })
})

describe('billing cycles', () => {
  it('offers all three cycles, matching the marketing page', () => {
    expect([...PLAN_CYCLES]).toEqual(['monthly', 'quarterly', 'annual'])
    expect(isPlanCycle('annual')).toBe(true)
  })

  it('discounts quarterly by exactly 10%', () => {
    const m = planQuote(PLANS.team, 'monthly', 3, 100)
    const q = planQuote(PLANS.team, 'quarterly', 3, 100)
    expect(q.monthly).toBeCloseTo(m.monthly * 0.9, 10)
  })

  it('discounts annual by 20%', () => {
    const m = planQuote(PLANS.team, 'monthly', 3, 100)
    const a = planQuote(PLANS.team, 'annual', 3, 100)
    expect(a.monthly).toBeCloseTo(m.monthly * 0.8, 10)
    // Charged upfront for the full year at the discounted rate.
    expect(a.charged).toBeCloseTo(m.monthly * 12 * 0.8, 10)
  })

  it('charges 3 months up front on quarterly', () => {
    const q = planQuote(PLANS.team, 'quarterly', 3, 100)
    expect(q.charged).toBeCloseTo(q.monthly * 3, 10)
    // $89 x 0.9 x 3
    expect(q.charged).toBeCloseTo(240.3, 10)
  })

  it('charges 12 months up front on annual', () => {
    const a = planQuote(PLANS.team, 'annual', 3, 100)
    expect(a.charged).toBeCloseTo(a.monthly * 12, 10)
    // $89 x 12 months, less 20% = $854.40 charged upfront
    expect(a.charged).toBeCloseTo(854.4, 10)
  })

  // The DB column is free text until the check constraint catches it; a raw
  // read must never silently treat 'annual' as 'monthly' and under-price it.
  it('readCycle preserves annual and defaults junk to monthly', () => {
    expect(readCycle('annual')).toBe('annual')
    expect(readCycle('quarterly')).toBe('quarterly')
    expect(readCycle(null)).toBe('monthly')
    expect(readCycle('yearly')).toBe('monthly')
  })
})

describe('graduated profile pricing', () => {
  it('prices Team from the configured profile count, not a flat rate', () => {
    expect(planQuote(PLANS.team, 'monthly', 3, 25).listMonthly).toBeCloseTo(40, 10)
    expect(planQuote(PLANS.team, 'monthly', 3, 1000).listMonthly).toBeCloseTo(374, 10)
  })

  it('clamps the configurator to [PF_MIN, PF_MAX]', () => {
    expect(planQuote(PLANS.team, 'monthly', 3, 1).profiles).toBe(PF_MIN)
    expect(planQuote(PLANS.team, 'monthly', 3, 99999).profiles).toBe(PF_MAX)
  })

  it('ignores a profile count on fixed plans', () => {
    const q = planQuote(PLANS.starter, 'monthly', 1, 500)
    expect(q.profiles).toBe(10)
    expect(q.listMonthly).toBe(19)
  })

  it('drops the per-profile rate as volume rises', () => {
    const small = planQuote(PLANS.team, 'monthly', 3, 25).perProfile
    const large = planQuote(PLANS.team, 'monthly', 3, 1000).perProfile
    expect(large).toBeLessThan(small)
    expect(small).toBeCloseTo(1.6, 10)
  })
})

describe('seat billing', () => {
  it('charges nothing for the 3 members included in Team', () => {
    expect(billableSeats(PLANS.team, 1)).toBe(0)
    expect(billableSeats(PLANS.team, 3)).toBe(0)
    expect(planList(PLANS.team, 3, 100)).toBeCloseTo(89, 10)
  })

  it('bills only members beyond the included 3', () => {
    expect(billableSeats(PLANS.team, 5)).toBe(2)
    expect(planList(PLANS.team, 5, 100)).toBeCloseTo(89 + 2 * SEAT_RATE, 10)
  })

  it('never bills seats on a plan that does not sell them', () => {
    expect(billableSeats(PLANS.starter, 10)).toBe(0)
    expect(planList(PLANS.starter, 10)).toBe(19)
  })

  it('applies the cycle discount to seat add-ons too', () => {
    const q = planQuote(PLANS.team, 'quarterly', 5, 100)
    expect(q.listMonthly).toBeCloseTo(94, 10)
    expect(q.monthly).toBeCloseTo(84.6, 10)
    expect(q.billableSeats).toBe(2)
  })
})

describe('free plan', () => {
  // 3 profiles, mirroring ghost.plans.profile_limit. The DB is authoritative —
  // enforce_profile_limit reads it — so a mismatch here would show users a cap
  // the database will not honour.
  it('costs nothing and holds 3 profiles', () => {
    expect(planQuote(PLANS.free, 'monthly', 1).charged).toBe(0)
    expect(PLANS.free.profiles).toBe(3)
  })
})
