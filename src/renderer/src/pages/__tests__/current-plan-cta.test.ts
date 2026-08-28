// Which plan card is "current" — and therefore not buyable again.
//
// The bug: a Team customer on 100 profiles / 3 seats opened the upgrade modal
// and "Choose Team" was live, so clicking it re-purchased the identical plan.
//
// The subtlety is that Team is a CONFIGURATOR. Being on Team is NOT enough to
// disable its card: dragging the profile stepper from 100 to 200 is a real
// upgrade and must stay clickable. Only the exact configuration already paid
// for — plan, profiles, seats AND cycle — counts as current.

import { describe, it, expect } from 'vitest'
import { type PlanCycle } from '@shared/pricing'
import {
  isCurrentPlan,
  ctaLabel,
  formatDate,
  type CurrentSubscription
} from '../billing/currentPlan'

const TEAM_100: CurrentSubscription = {
  planId: 'team',
  profiles: 100,
  seats: 3,
  cycle: 'monthly'
}

const teamCard = (profiles: number, seats: number, cycle: PlanCycle = 'monthly') => ({
  planKey: 'team',
  profiles,
  seats,
  cycle,
  configurable: true
})

const starterCard = (cycle: PlanCycle = 'monthly') => ({
  planKey: 'starter',
  profiles: 10,
  seats: 1,
  cycle,
  configurable: false
})

describe('isCurrentPlan — the reported bug', () => {
  it('marks the exact current Team configuration as current', () => {
    expect(isCurrentPlan(TEAM_100, teamCard(100, 3))).toBe(true)
  })

  it('does NOT mark a different plan as current', () => {
    expect(isCurrentPlan(TEAM_100, starterCard())).toBe(false)
  })
})

describe('Team configurator — changing capacity is a real purchase', () => {
  it('stays buyable when profiles are increased', () => {
    expect(isCurrentPlan(TEAM_100, teamCard(200, 3))).toBe(false)
  })

  it('stays buyable when profiles are decreased (downgrade)', () => {
    expect(isCurrentPlan(TEAM_100, teamCard(50, 3))).toBe(false)
  })

  it('stays buyable when seats change', () => {
    expect(isCurrentPlan(TEAM_100, teamCard(100, 5))).toBe(false)
    expect(isCurrentPlan(TEAM_100, teamCard(100, 2))).toBe(false)
  })
})

describe('billing cycle is part of the deal', () => {
  it('monthly → annual is a real change on Team', () => {
    expect(isCurrentPlan(TEAM_100, teamCard(100, 3, 'annual'))).toBe(false)
  })

  it('monthly → quarterly is a real change on a fixed plan', () => {
    const starter: CurrentSubscription = {
      planId: 'starter',
      profiles: 10,
      seats: 1,
      cycle: 'monthly'
    }
    expect(isCurrentPlan(starter, starterCard('monthly'))).toBe(true)
    expect(isCurrentPlan(starter, starterCard('quarterly'))).toBe(false)
  })
})

describe('fixed plans ignore the configurator fields', () => {
  it('matches on plan + cycle alone', () => {
    const starter: CurrentSubscription = {
      // Capacity differing from the card must not matter on a fixed plan.
      planId: 'starter',
      profiles: 999,
      seats: 42,
      cycle: 'monthly'
    }
    expect(isCurrentPlan(starter, starterCard())).toBe(true)
  })
})

describe('failing toward letting people pay', () => {
  it('never claims current when there is no subscription', () => {
    // Free users, and the first render before billing loads.
    expect(isCurrentPlan(null, teamCard(100, 3))).toBe(false)
    expect(isCurrentPlan(null, starterCard())).toBe(false)
  })

  it('never claims current when capacity failed to load', () => {
    // Disabling on a guess would block a sale; the worst case the other way
    // is a no-op checkout.
    const unknown: CurrentSubscription = {
      planId: 'team',
      profiles: null,
      seats: null,
      cycle: 'monthly'
    }
    expect(isCurrentPlan(unknown, teamCard(100, 3))).toBe(false)
  })
})

describe('ctaLabel', () => {
  it('shows the plan name when buyable', () => {
    expect(ctaLabel(false, false, 'Team')).toBe('Choose Team')
    expect(ctaLabel(false, false, 'Starter')).toBe('Choose Starter')
  })

  it('says "Current plan" instead of the buy verb', () => {
    expect(ctaLabel(true, false, 'Team')).toBe('Current plan')
  })

  it('lets the in-flight state win — never a stale label mid-checkout', () => {
    expect(ctaLabel(false, true, 'Team')).toBe('Starting…')
    expect(ctaLabel(true, true, 'Team')).toBe('Starting…')
  })
})

describe('existing subscribers go to the billing portal', () => {
  // A workspace that already pays cannot "buy" another plan: Stripe would
  // create a SECOND subscription and bill for both. Changing an existing one
  // is what the portal is for — it handles proration, up/downgrade and
  // cancellation, none of which a fresh Checkout session can do.
  const hasActivePlan = (planId: string | null): boolean => planId != null && planId !== 'free'

  it('routes a paid workspace to the portal', () => {
    expect(hasActivePlan('team')).toBe(true)
    expect(hasActivePlan('starter')).toBe(true)
  })

  it('lets free and unknown workspaces check out normally', () => {
    // Nothing to amend, so a new subscription is exactly right.
    expect(hasActivePlan('free')).toBe(false)
    expect(hasActivePlan(null)).toBe(false)
  })

  it('labels the CTA by what the click actually does', () => {
    // "Choose Team" would promise a purchase the button does not make.
    expect(ctaLabel(false, false, 'Team', true)).toBe('Change plan')
    expect(ctaLabel(false, false, 'Team', false)).toBe('Choose Team')
  })

  it('still marks the active plan as current, not changeable', () => {
    expect(ctaLabel(true, false, 'Team', true)).toBe('Current plan')
  })

  it('keeps the in-flight state ahead of everything', () => {
    expect(ctaLabel(false, true, 'Team', true)).toBe('Starting…')
  })
})

describe('a plan cancelling at period end', () => {
  // Julian's call (2026-08-17): a scheduled cancellation still counts as an
  // ACTIVE plan — the subscription is live until the date, and buying
  // elsewhere would bill two at once. But the modal has to SAY so, otherwise
  // "Change plan" gives no hint the current plan is ending.
  const subtitle = (
    cancelAtPeriodEnd: boolean,
    periodEnd: string | null,
    planName: string
  ): string =>
    cancelAtPeriodEnd && periodEnd
      ? `Your ${planName} plan ends on ${formatDate(periodEnd)} — you keep access until then.`
      : 'Configured from your current workspace usage.'

  it('names the end date when a cancellation is scheduled', () => {
    const out = subtitle(true, '2026-11-10T17:40:13Z', 'Team')
    expect(out).toContain('ends on')
    expect(out).toContain('2026')
    expect(out).toContain('you keep access until then')
  })

  it('falls back to the default line when nothing is scheduled', () => {
    expect(subtitle(false, '2026-11-10T17:40:13Z', 'Team')).toBe(
      'Configured from your current workspace usage.'
    )
  })

  it('does not claim an end date it does not have', () => {
    // cancel_at_period_end true but no period end (a partial webhook write)
    // must not render "ends on Invalid Date".
    expect(subtitle(true, null, 'Team')).toBe('Configured from your current workspace usage.')
  })

  it('still routes to the portal — the plan is live until the date', () => {
    expect(ctaLabel(false, false, 'Team', true)).toBe('Change plan')
  })
})

describe('the modal opens on what you already buy', () => {
  // A Team customer on 200 profiles / 8 seats used to see 100 / 3 — the
  // marketing defaults — which reads as a downgrade and hides the
  // configuration they are paying for. It also meant the Team card never
  // showed "Current plan", because the steppers disagreed with the plan.
  const MAX_MEMBERS = 50
  const PF_MAX = 1000
  const PF_MIN = 25
  const SEATS_INCLUDED = 3

  const seed = (u: {
    profileLimit: number | null
    seatLimit: number | null
    profilesUsed: number | null
    seatsUsed: number | null
  }): { members: number; profiles: number } => {
    const seatFloor = Math.min(MAX_MEMBERS, Math.max(SEATS_INCLUDED, u.seatsUsed ?? 0))
    const profileFloor = Math.min(PF_MAX, Math.max(PF_MIN, u.profilesUsed ?? 0))
    return {
      members: Math.min(MAX_MEMBERS, Math.max(seatFloor, u.seatLimit ?? 0)),
      profiles: Math.min(PF_MAX, Math.max(100, profileFloor, u.profileLimit ?? 0))
    }
  }

  it('seeds from PURCHASED capacity, not from usage', () => {
    // 200/8 bought, barely any of it consumed.
    expect(seed({ profileLimit: 200, seatLimit: 8, profilesUsed: 6, seatsUsed: 2 })).toEqual({
      profiles: 200,
      members: 8
    })
  })

  it('falls back to the marketing defaults with nothing purchased', () => {
    expect(seed({ profileLimit: null, seatLimit: null, profilesUsed: 1, seatsUsed: 1 })).toEqual({
      profiles: 100,
      members: 3
    })
  })

  it('never opens below what the workspace already occupies', () => {
    // 300 profiles in use on a free plan: quoting 100 would be un-buyable.
    expect(seed({ profileLimit: null, seatLimit: null, profilesUsed: 300, seatsUsed: 5 })).toEqual({
      profiles: 300,
      members: 5
    })
  })

  it('degrades to defaults when the read fails, not to zero', () => {
    expect(
      seed({ profileLimit: null, seatLimit: null, profilesUsed: null, seatsUsed: null })
    ).toEqual({ profiles: 100, members: 3 })
  })

  it('clamps to the plan ceiling', () => {
    // Beyond 1000 profiles / 50 seats is a sales conversation.
    expect(seed({ profileLimit: 5000, seatLimit: 999, profilesUsed: 0, seatsUsed: 0 })).toEqual({
      profiles: PF_MAX,
      members: MAX_MEMBERS
    })
  })
})
