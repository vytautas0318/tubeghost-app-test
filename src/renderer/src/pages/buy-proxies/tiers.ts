// The proxy packs shown on the Buy proxies ladder.
//
// Split out of BuyProxies.tsx to keep that file under the 250-line rule once
// the page gained an embedded mode.
//
// `name` is a CONTRACT with proxies-checkout: it looks the pack up by name in
// PROXY_PLANS, so a rename here makes the plan unsellable. `perIp` mirrors the
// threshold rates in the shared pricing module's PROXY_TIERS — the whole pack
// bills at the rate its size unlocks, not a graduated blend.

import type { ProxyCycle } from './checkoutLink'

export type Tier = {
  id: string
  /** Must match the plan name in proxies-checkout's PROXY_PLANS. */
  name: string
  desc: string
  ips: number
  /** Monthly per-IP rate at this pack size. */
  perIp: number
  feat?: boolean
  /** Team seats included; absent means none. */
  members?: number
}

export const TIERS: Tier[] = [
  { id: 'starter', name: 'Starter', desc: 'Perfect for testing', ips: 1, perIp: 8.0 },
  // 5 IPs at $39/mo. Absent from the public pricing page but sold on the
  // TubeProxies dashboard, and active in Stripe — it was missing here until
  // 2026-08-13, so nobody could buy a real tier.
  { id: 'hobby', name: 'Hobby', desc: 'For a small fleet', ips: 5, perIp: 7.8 },
  { id: 'small', name: 'Small Team', desc: 'Great for small teams', ips: 10, perIp: 7.5 },
  { id: 'growth', name: 'Growth', desc: 'Scale your operations', ips: 25, perIp: 7.0, feat: true },
  { id: 'scale', name: 'Scale', desc: 'For teams at scale', ips: 50, perIp: 6.5, members: 2 },
  {
    id: 'enterprise',
    name: 'Enterprise',
    desc: 'Maximum volume',
    ips: 100,
    perIp: 5.0,
    members: 10
  }
]

/** Terms offered, in the same order as every other pricing surface. */
export const PROXY_TERMS: [ProxyCycle, string, string][] = [
  ['monthly', 'Monthly', ''],
  ['quarterly', 'Quarterly', 'Save 10%'],
  ['annual', 'Annual', 'Save 20%']
]

/** How many months a term bills at once — the "Billed … at" multiplier. */
export function periodsFor(cycle: ProxyCycle): number {
  return cycle === 'annual' ? 12 : cycle === 'quarterly' ? 3 : 1
}
