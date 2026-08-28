// Tests for the upgrade configurator's derived values: seeding from live
// usage, clamping, and the quote math. These exercise the same pure functions
// the modal renders, without mounting React.

import { describe, it, expect } from 'vitest'
import {
  PF_MAX,
  PF_MIN,
  applyCycle,
  billedTotal,
  money,
  starterList,
  teamList
} from '@shared/pricing'

// Mirrors useUpgradeConfig's seeding rules. Live usage may only RAISE the
// opening configuration above the marketing page's defaults, never lower it —
// so the modal quotes the same published prices as tubeghost.com.
const SITE_DEFAULT_PROFILES = 100

function seedProfiles(profilesUsed: number): number {
  return Math.min(PF_MAX, Math.max(PF_MIN, SITE_DEFAULT_PROFILES, profilesUsed))
}
function seedSeats(seatsUsed: number): number {
  return Math.max(0, seatsUsed - 1)
}

describe('upgrade seeding from live usage', () => {
  it('opens at the site default for any workspace below it', () => {
    expect(seedProfiles(0)).toBe(100)
    expect(seedProfiles(2)).toBe(100)
    expect(seedProfiles(25)).toBe(100)
    expect(seedProfiles(99)).toBe(100)
  })

  it('rises above the default for a larger fleet', () => {
    expect(seedProfiles(137)).toBe(137)
    expect(seedProfiles(300)).toBe(300)
  })

  it('clamps above the maximum', () => {
    expect(seedProfiles(5000)).toBe(PF_MAX)
  })

  it('never opens below the Team minimum', () => {
    expect(seedProfiles(0)).toBeGreaterThanOrEqual(PF_MIN)
  })

  // Add-ons are things you choose to BUY in this modal, not a mirror of what
  // the workspace already holds — so they always open at zero, even for a
  // workspace that already has proxies and numbers.
  it('always opens add-ons at zero regardless of live usage', () => {
    const seedAddon = (): number => 0
    expect(seedAddon()).toBe(0)
    // A workspace holding 2 proxies / 5 numbers still quotes the bare plan.
    expect(money(starterList(seedAddon(), seedAddon()))).toBe('$19')
    expect(money(teamList(seedProfiles(2), 0, seedAddon(), seedAddon()))).toBe('$89')
  })

  it('bills only additional seats (the first is included)', () => {
    expect(seedSeats(1)).toBe(0)
    expect(seedSeats(4)).toBe(3)
    // Never negative, even on an inconsistent count.
    expect(seedSeats(0)).toBe(0)
  })
})

describe('downgrade guard', () => {
  // Mirrors UpgradeModal.blockedBy.
  const blocked = (used: number, limit: number): string | null =>
    used > limit ? `delete ${used - limit}` : null

  it('blocks when live usage exceeds the target cap', () => {
    expect(blocked(40, 10)).toBe('delete 30')
  })

  it('allows an exact fit and any upgrade', () => {
    expect(blocked(10, 10)).toBeNull()
    expect(blocked(3, 25)).toBeNull()
  })
})

describe('quotes rendered by the modal', () => {
  it('never renders a raw float on any cycle', () => {
    for (const cycle of ['monthly', 'quarterly', 'annual'] as const) {
      for (const profiles of [25, 50, 100, 137, 1000]) {
        const monthly = applyCycle(teamList(profiles, 3, 7, 2), cycle)
        expect(money(monthly)).toMatch(/^\$[\d,]+(\.\d{2})?$/)
        expect(money(billedTotal(monthly, cycle))).toMatch(/^\$[\d,]+(\.\d{2})?$/)
      }
    }
  })

  // Parity with tubeghost.com: the modal must open quoting the SAME prices the
  // marketing pricing page publishes at its defaults.
  it('opens a free-plan workspace at the published site prices', () => {
    const team = teamList(seedProfiles(2), seedSeats(1), 0, 0)
    expect(money(team)).toBe('$89')
    expect(money(applyCycle(team, 'annual'))).toBe('$71.20')
    expect(money(billedTotal(applyCycle(team, 'annual'), 'annual'))).toBe('$854.40')

    const starter = starterList(0, 0)
    expect(money(starter)).toBe('$19')
    expect(money(applyCycle(starter, 'annual'))).toBe('$15.20')
    expect(money(billedTotal(applyCycle(starter, 'annual'), 'annual'))).toBe('$182.40')
  })

  it('quotes above the default only for a larger fleet', () => {
    const list = teamList(seedProfiles(300), 0, 0, 0)
    expect(money(applyCycle(list, 'annual'))).toBe('$143.20')
  })

  it('matches the marketing anchor for a 100-profile annual team', () => {
    const monthly = applyCycle(teamList(100, 0, 0, 0), 'annual')
    expect(money(monthly)).toBe('$71.20')
    expect(money(billedTotal(monthly, 'annual'))).toBe('$854.40')
  })

  it('starter add-ons price off the tier tables', () => {
    // 10 proxies → $7.50/ea, 3 numbers → $13.33/ea
    expect(money(starterList(10, 3))).toBe('$133.99')
  })
})
