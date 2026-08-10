import { describe, expect, it } from 'vitest'
import {
  applyCycle,
  billableSeats,
  billedTotal,
  money,
  perProfileRate,
  pfPrice,
  PF_MAX,
  PF_MIN,
  PLANS,
  planList,
  SEAT_RATE,
  STARTER_BASE,
  teamList,
  validateTeamConfig
} from '../pricing.js'

// The client-agreed anchor prices. These are contractual — if a tier edit
// moves any of them, the marketing page and Stripe disagree with this app.
const ANCHORS: [number, number][] = [
  [25, 40],
  [50, 63],
  [100, 89],
  [200, 134],
  [500, 249],
  [1000, 374]
]

describe('graduated profile pricing', () => {
  it.each(ANCHORS)('%i profiles = $%i/mo', (profiles, expected) => {
    expect(pfPrice(profiles)).toBeCloseTo(expected, 2)
  })

  it('is graduated, not volume — 50 profiles is not 50 × the top rate', () => {
    // The distinction that matters: volume pricing would bill 50 × $0.92 =
    // $46. Graduated bills the first 25 at $1.60 and the next 25 at $0.92.
    expect(pfPrice(50)).toBeCloseTo(63, 2)
    expect(pfPrice(50)).not.toBeCloseTo(46, 2)
  })

  it('charges nothing at zero and never goes backwards', () => {
    expect(pfPrice(0)).toBe(0)
    let prev = 0
    for (let n = 0; n <= PF_MAX; n += 25) {
      const p = pfPrice(n)
      expect(p).toBeGreaterThanOrEqual(prev)
      prev = p
    }
  })

  it('gets cheaper per profile as volume grows', () => {
    const rates = [25, 50, 100, 500, 1000].map(perProfileRate)
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeLessThan(rates[i - 1])
    }
  })

  it('returns 0 rather than NaN at zero profiles', () => {
    expect(perProfileRate(0)).toBe(0)
  })
})

describe('seats + team totals', () => {
  it('adds flat seat cost on top of profiles', () => {
    expect(teamList(100, 4)).toBeCloseTo(89 + 4 * SEAT_RATE, 2)
  })

  it('team with no seats is just the profile cost', () => {
    expect(teamList(25, 0)).toBeCloseTo(40, 2)
  })
})

describe('included seats', () => {
  // The bug this guards: ghost.workspace_seat_limit computes
  // plans.member_seat_limit + workspaces.extra_seats. Storing the TOTAL
  // member count in extra_seats would grant the 3 included seats twice.
  it('bills nothing for the included members', () => {
    expect(billableSeats(PLANS.team, PLANS.team.seatsIncluded)).toBe(0)
    expect(billableSeats(PLANS.team, 0)).toBe(0)
    expect(billableSeats(PLANS.team, 1)).toBe(0)
  })

  it('bills only members beyond the included three', () => {
    expect(billableSeats(PLANS.team, 4)).toBe(1)
    expect(billableSeats(PLANS.team, 10)).toBe(7)
  })

  it('never bills seats on Starter, which sells none', () => {
    expect(billableSeats(PLANS.starter, 5)).toBe(0)
  })

  it('quotes 100 profiles with the included members at the anchor price', () => {
    // $89 is profiles alone — the 3 members must add nothing.
    expect(planList(PLANS.team, PLANS.team.seatsIncluded, 100)).toBeCloseTo(89, 2)
  })

  it('adds SEAT_RATE per member beyond the included three', () => {
    expect(planList(PLANS.team, 5, 100)).toBeCloseTo(89 + 2 * SEAT_RATE, 2)
  })

  it('Starter is its flat base regardless of members asked for', () => {
    expect(planList(PLANS.starter, 3)).toBeCloseTo(STARTER_BASE, 2)
  })

  it('matches ghost.plans, which is what the DB triggers enforce', () => {
    // starter: profile_limit 10 / member_seat_limit 1
    expect(PLANS.starter.profiles).toBe(10)
    expect(PLANS.starter.seatsIncluded).toBe(1)
    // team: member_seat_limit 3
    expect(PLANS.team.seatsIncluded).toBe(3)
  })
})

describe('billing cycles', () => {
  it('quarterly takes 10% off the monthly rate', () => {
    expect(applyCycle(100, 'quarterly')).toBeCloseTo(90, 2)
  })

  it('annual gives 2 months free', () => {
    expect(applyCycle(120, 'annual')).toBeCloseTo(100, 2)
    // 12 months at the discounted rate = the price of 10 months.
    expect(billedTotal(applyCycle(120, 'annual'), 'annual')).toBeCloseTo(1200, 2)
  })

  it('monthly is unchanged and reports no up-front total', () => {
    expect(applyCycle(89, 'monthly')).toBe(89)
    expect(billedTotal(89, 'monthly')).toBe(0)
  })

  it('quarterly bills 3 months at once', () => {
    expect(billedTotal(90, 'quarterly')).toBeCloseTo(270, 2)
  })
})

describe('money formatting', () => {
  it('drops cents on whole numbers', () => {
    expect(money(89)).toBe('$89')
  })

  it('keeps cents when present', () => {
    expect(money(74.166)).toBe('$74.17')
  })

  it('groups thousands', () => {
    expect(money(1200)).toBe('$1,200')
  })
})

describe('team config validation', () => {
  it('accepts a normal configuration', () => {
    expect(validateTeamConfig(100, 3)).toBeNull()
  })

  it('rejects below the minimum', () => {
    expect(validateTeamConfig(PF_MIN - 1, 0)).toMatch(/starts at/)
  })

  it('sends above-max to sales', () => {
    expect(validateTeamConfig(PF_MAX + 1, 0)).toMatch(/sales/)
  })

  it('rejects fractional and negative input', () => {
    expect(validateTeamConfig(25.5, 0)).toMatch(/whole number/)
    expect(validateTeamConfig(100, -1)).toMatch(/negative/)
  })
})

describe('starter', () => {
  it('is a fixed base price', () => {
    expect(STARTER_BASE).toBe(19)
  })
})
