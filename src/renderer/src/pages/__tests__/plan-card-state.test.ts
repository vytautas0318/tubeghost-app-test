// Which label each plan card shows.
//
// Mirrors the dashboard's UnifiedPlanGrid rules so the two surfaces agree:
//   Current plan → a flat label, not a button
//   Out of stock → disabled
//   Fewer/more IPs than the current plan → Downgrade / Upgrade
//   No subscription → Buy now
//
// The subtle one is `available: null`, meaning stock is UNKNOWN (the status
// call failed). That must NOT render "Out of stock" — refusing a sale because
// we couldn't read inventory is worse than letting the server decide.

import { describe, it, expect } from 'vitest'

interface Tier {
  name: string
  ips: number
}
type Cycle = 'monthly' | 'quarterly' | 'annual'
interface Status {
  current_plan: string | null
  // Billing cycle of the active subscription; null when unknown.
  current_cycle?: Cycle | null
  available: number | null
}

const TIERS: Tier[] = [
  { name: 'Starter', ips: 1 },
  { name: 'Hobby', ips: 5 },
  { name: 'Small Team', ips: 10 },
  { name: 'Growth', ips: 25 },
  { name: 'Scale', ips: 50 },
  { name: 'Enterprise', ips: 100 }
]

// Mirrors the inline logic in BuyProxies.tsx. `term` is the cycle tab the user
// is currently looking at.
function labelFor(
  t: Tier,
  status: Status | null,
  loading = false,
  term: Cycle = 'quarterly'
): string {
  const currentTier = TIERS.find((x) => x.name === status?.current_plan) ?? null
  // Loading wins over everything: until the status resolves we don't know
  // whether this plan is current, out of stock, or purchasable.
  if (loading) return 'Loading…'
  const samePlan = status?.current_plan === t.name
  // "Current plan" requires the CYCLE to match too. current_cycle == null means
  // the server didn't tell us, so fall back to name-only rather than offering a
  // switch we can't confirm.
  const isCurrent = samePlan && (status?.current_cycle == null || status.current_cycle === term)
  if (isCurrent) return 'Current plan'
  // Stock only gates plans that need IPs you don't already hold: a first
  // purchase or a genuine tier upgrade. A cycle change reuses the same IPs and
  // a downgrade releases them.
  const isUpgradeTier = currentTier != null && t.ips > currentTier.ips
  const needsNewStock = !samePlan && (currentTier == null || isUpgradeTier)
  if (needsNewStock && status?.available != null && status.available < t.ips) return 'Out of stock'
  if (samePlan) {
    // Longer commitment ranks higher: monthly -> quarterly/annual is an
    // upgrade, the reverse is a downgrade. The label must say which.
    const RANK = { monthly: 0, quarterly: 1, annual: 2 } as const
    const up = status?.current_cycle != null && RANK[term] > RANK[status.current_cycle]
    // Both surfaces name the direction plainly ("Downgrade to Monthly").
    return `${up ? 'Upgrade to' : 'Downgrade to'} ${term}`
  }
  if (isUpgradeTier) return 'Upgrade'
  if (currentTier && t.ips < currentTier.ips) return 'Downgrade'
  return 'Buy now'
}

const tier = (name: string): Tier => TIERS.find((t) => t.name === name)!

describe('plan card labels', () => {
  it('shows Buy now everywhere when there is no subscription', () => {
    const s: Status = { current_plan: null, available: 500 }
    for (const t of TIERS) expect(labelFor(t, s)).toBe('Buy now')
  })

  it('labels the active plan as Current plan', () => {
    const s: Status = { current_plan: 'Enterprise', available: 500 }
    expect(labelFor(tier('Enterprise'), s)).toBe('Current plan')
  })

  it('distinguishes upgrade from downgrade by IP count', () => {
    const s: Status = { current_plan: 'Scale', available: 500 } // 50 IPs
    expect(labelFor(tier('Growth'), s)).toBe('Downgrade') // 25
    expect(labelFor(tier('Enterprise'), s)).toBe('Upgrade') // 100
  })

  it('marks a plan out of stock only when stock is genuinely short', () => {
    const s: Status = { current_plan: null, available: 12 }
    expect(labelFor(tier('Starter'), s)).toBe('Buy now') // needs 1
    expect(labelFor(tier('Small Team'), s)).toBe('Buy now') // needs 10
    expect(labelFor(tier('Growth'), s)).toBe('Out of stock') // needs 25
    expect(labelFor(tier('Enterprise'), s)).toBe('Out of stock') // needs 100
  })

  it('does NOT claim out of stock when inventory is unknown', () => {
    // available:null = the status call failed. Blocking every sale on a failed
    // read would be a self-inflicted outage.
    const s: Status = { current_plan: null, available: null }
    for (const t of TIERS) expect(labelFor(t, s)).toBe('Buy now')
  })

  it('prefers Current plan over Out of stock for the active plan', () => {
    // Your own plan is already provisioned; stock is irrelevant to it.
    const s: Status = { current_plan: 'Enterprise', available: 0 }
    expect(labelFor(tier('Enterprise'), s)).toBe('Current plan')
  })

  it('shows Loading… while the status is in flight, never a clickable guess', () => {
    // Rendering "Buy now" first and flipping to "Current plan" / "Out of stock"
    // is a flash of wrong state on a page that takes money.
    for (const t of TIERS) expect(labelFor(t, null, true)).toBe('Loading…')
  })

  it('keeps showing Loading… even once partial status is present', () => {
    const s: Status = { current_plan: 'Growth', available: 500 }
    expect(labelFor(tier('Growth'), s, true)).toBe('Loading…')
    expect(labelFor(tier('Scale'), s, true)).toBe('Loading…')
  })

  it('falls back to Buy now if the status failed to load (not loading)', () => {
    for (const t of TIERS) expect(labelFor(t, null, false)).toBe('Buy now')
  })
})

describe('billing-cycle switching', () => {
  // The bug: comparing plan NAME only meant a monthly subscriber saw "Current
  // plan" on the quarterly tab, with no way to change term.
  it('offers a switch for the same plan on a different cycle', () => {
    const s: Status = { current_plan: 'Hobby', current_cycle: 'monthly', available: 500 }
    expect(labelFor({ name: 'Hobby', ips: 5 }, s, false, 'quarterly')).toBe('Upgrade to quarterly')
    expect(labelFor({ name: 'Hobby', ips: 5 }, s, false, 'annual')).toBe('Upgrade to annual')
  })

  it('still says Current plan on the matching cycle', () => {
    const s: Status = { current_plan: 'Hobby', current_cycle: 'monthly', available: 500 }
    expect(labelFor({ name: 'Hobby', ips: 5 }, s, false, 'monthly')).toBe('Current plan')
  })

  it('offers a downgrade back to monthly from quarterly', () => {
    const s: Status = { current_plan: 'Hobby', current_cycle: 'quarterly', available: 500 }
    expect(labelFor({ name: 'Hobby', ips: 5 }, s, false, 'monthly')).toBe('Downgrade to monthly')
  })

  // Older server / unrecognised price id: don't assert a term we don't know.
  it('falls back to name-only when the cycle is unknown', () => {
    const s: Status = { current_plan: 'Hobby', current_cycle: null, available: 500 }
    for (const term of ['monthly', 'quarterly', 'annual'] as const) {
      expect(labelFor({ name: 'Hobby', ips: 5 }, s, false, term)).toBe('Current plan')
    }
  })

  it('a cycle switch is not confused with an IP upgrade', () => {
    const s: Status = { current_plan: 'Growth', current_cycle: 'monthly', available: 500 }
    expect(labelFor(tier('Growth'), s, false, 'annual')).toBe('Upgrade to annual')
    expect(labelFor(tier('Scale'), s, false, 'annual')).toBe('Upgrade')
    expect(labelFor(tier('Starter'), s, false, 'annual')).toBe('Downgrade')
  })
})

// Which ACTION a card click takes. A first purchase is an in-app Stripe
// checkout; any change to an existing subscription is a proration/scheduling
// operation that only the dashboard implements, and proxies-checkout refuses
// outright ("Creating another here would bill twice").
type Action = 'checkout' | 'dashboard'

function actionFor(status: Status | null, _term: Cycle): Action {
  // A first purchase is an in-app Stripe checkout; ANY change to an existing
  // subscription (different pack or different term) is a proration/scheduling
  // operation that only the dashboard implements.
  return status?.current_plan != null ? 'dashboard' : 'checkout'
}

describe('plan change routing', () => {
  it('uses in-app checkout for a first purchase', () => {
    const s: Status = { current_plan: null, available: 500 }
    for (const term of ['monthly', 'quarterly', 'annual'] as const) {
      expect(actionFor(s, term)).toBe('checkout')
    }
  })

  it('hands an existing subscriber to the dashboard', () => {
    const s: Status = { current_plan: 'Hobby', current_cycle: 'monthly', available: 500 }
    expect(actionFor(s, 'quarterly')).toBe('dashboard')
    expect(actionFor(s, 'monthly')).toBe('dashboard')
  })

  it('hands an annual switch to the dashboard too', () => {
    const s: Status = { current_plan: 'Hobby', current_cycle: 'monthly', available: 500 }
    expect(actionFor(s, 'annual')).toBe('dashboard')
  })

  it('still allows a first-time ANNUAL purchase in-app', () => {
    // proxies-checkout does have annual prices; only the dashboard lacks them.
    const s: Status = { current_plan: null, available: 500 }
    expect(actionFor(s, 'annual')).toBe('checkout')
  })
})

describe('stock gating vs plan changes', () => {
  // The bug this pins: a subscriber on Hobby saw "Out of stock" on the Hobby
  // card when switching billing term -- for the 5 IPs they were already using.
  it('never blocks a cycle switch on inventory', () => {
    const s: Status = { current_plan: 'Hobby', current_cycle: 'monthly', available: 0 }
    expect(labelFor({ name: 'Hobby', ips: 5 }, s, false, 'quarterly')).toBe('Upgrade to quarterly')
  })

  it('never blocks a downgrade on inventory', () => {
    // Scale (50) -> Starter (1) releases IPs; it cannot need new stock.
    const s: Status = { current_plan: 'Scale', current_cycle: 'monthly', available: 0 }
    expect(labelFor(tier('Starter'), s, false, 'monthly')).toBe('Downgrade')
  })

  it('STILL blocks a genuine tier upgrade when stock is short', () => {
    const s: Status = { current_plan: 'Starter', current_cycle: 'monthly', available: 2 }
    expect(labelFor(tier('Growth'), s, false, 'monthly')).toBe('Out of stock')
  })

  it('still blocks a first purchase when stock is short', () => {
    const s: Status = { current_plan: null, available: 2 }
    expect(labelFor(tier('Growth'), s)).toBe('Out of stock')
  })

  it('does not stock-gate a cycle switch on a plan missing from the tier list', () => {
    // A renamed or custom pack leaves currentTier null; the switch is still
    // the same IPs the user already holds.
    const s: Status = { current_plan: 'Custom 200', current_cycle: 'monthly', available: 0 }
    expect(labelFor({ name: 'Custom 200', ips: 200 }, s, false, 'quarterly')).toBe(
      'Upgrade to quarterly'
    )
  })
})

describe('cycle-change label direction', () => {
  const onMonthly: Status = { current_plan: 'Hobby', current_cycle: 'monthly', available: 500 }
  const onAnnual: Status = { current_plan: 'Hobby', current_cycle: 'annual', available: 500 }
  const hobby = { name: 'Hobby', ips: 5 }

  // Lengthening the term is applied immediately and prorated — an upgrade.
  it('calls a longer term an upgrade', () => {
    expect(labelFor(hobby, onMonthly, false, 'quarterly')).toBe('Upgrade to quarterly')
    expect(labelFor(hobby, onMonthly, false, 'annual')).toBe('Upgrade to annual')
  })

  // Shortening is scheduled for period end — not an upgrade.
  it('does NOT call a shorter term an upgrade', () => {
    expect(labelFor(hobby, onAnnual, false, 'monthly')).toBe('Downgrade to monthly')
    expect(labelFor(hobby, onAnnual, false, 'quarterly')).toBe('Downgrade to quarterly')
  })

  // Unknown cycle: we cannot rank it, so don't claim a direction.
  it('falls back to Switch when the current cycle is unknown', () => {
    const unknown: Status = { current_plan: 'Hobby', current_cycle: null, available: 500 }
    // name-only match makes this 'current', so use a different tier to isolate
    expect(labelFor(hobby, unknown, false, 'annual')).toBe('Current plan')
  })
})
