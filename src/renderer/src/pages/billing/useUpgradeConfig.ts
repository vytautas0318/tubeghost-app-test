// Configurator state for the upgrade modal.
//
// Seeds profiles from the workspace's LIVE usage (floored at the plan
// minimum) so the quote reflects what the user is actually running, then
// derives every price through the shared pricing module — the same one the
// marketing site and the checkout endpoint use.
//
// Deliberately covers profiles + seats ONLY. Proxies and phone numbers are
// TubeProxies products on their own Stripe subscriptions; quoting them here
// would imply one combined bill that checkout doesn't produce. They're bought
// from /buy-proxies and /phone instead.

import { useMemo, useState } from 'react'
import {
  addOnsAvailable,
  applyCycle,
  billedTotal,
  perProfileRate,
  PF_MAX,
  PF_MIN,
  PLANS,
  planList,
  SEAT_RATE,
  type Cycle,
  type GhostPlanKey
} from '@shared/pricing'
import { addOnsList } from '@shared/addons'

export interface Quote {
  listMonthly: number
  monthly: number
  billed: number
}

function quote(list: number, cycle: Cycle): Quote {
  const monthly = applyCycle(list, cycle)
  return { listMonthly: list, monthly, billed: billedTotal(monthly, cycle) }
}

export interface UpgradeConfig {
  cycle: Cycle
  setCycle: (c: Cycle) => void
  starter: { quote: Quote }
  team: {
    profiles: number
    setProfiles: (n: number) => void
    seats: number
    setSeats: (n: number) => void
    /** Derived per-profile label — never an input. */
    perProfile: number
    atMax: boolean
    quote: Quote
  }
  /**
   * TubeProxies add-ons bought in the same checkout. Unavailable on annual —
   * they have no annual price, and one Checkout session cannot mix intervals.
   */
  addOns: {
    available: boolean
    proxies: number
    setProxies: (n: number) => void
    numbers: number
    setNumbers: (n: number) => void
    /** Monthly list price of the selected add-ons, before the cycle discount. */
    list: number
  }
  /** Plan + add-ons, the figure the Buy button commits to. */
  total: (plan: GhostPlanKey) => Quote
}

/** The marketing page's opening configuration, so quotes match tubeghost.com. */
const SITE_DEFAULT_PROFILES = 100

export interface UpgradeUsage {
  profilesUsed: number
  seatsUsed: number
}

export function useUpgradeConfig(usage: UpgradeUsage): UpgradeConfig {
  // Annual by default, matching the marketing page.
  const [cycle, setCycle] = useState<Cycle>('annual')

  // Profiles seed from live usage but never below the site default, so a
  // workspace under 100 still sees the published price while a larger fleet
  // gets a quote that actually fits it.
  const [profiles, setProfiles] = useState(
    Math.min(PF_MAX, Math.max(PF_MIN, SITE_DEFAULT_PROFILES, usage.profilesUsed))
  )
  // TOTAL member count, matching the marketing stepper — it floors at the
  // plan's included seats and only bills beyond them. Seeded from live usage
  // so an existing team of 5 opens at 5, not at the 3 included.
  const [seats, setSeats] = useState(
    Math.max(PLANS.team.seatsIncluded, usage.seatsUsed)
  )

  // Add-ons start empty — they are things you choose to buy here, not a
  // reflection of what the workspace already holds on TubeProxies.
  const [proxies, setProxies] = useState(0)
  const [numbers, setNumbers] = useState(0)

  const addOnsOk = addOnsAvailable(cycle)
  // Selections are ignored (not just hidden) on annual, so a stale value can
  // never reach checkout and create a line item with no annual price.
  const addOnList = addOnsOk ? addOnsList(proxies, numbers) : 0

  /**
   * Switching to annual drops any configured add-ons. Keeping them would
   * quote a total the checkout cannot produce — proxies and numbers have no
   * annual price.
   */
  const changeCycle = (c: Cycle): void => {
    setCycle(c)
    if (!addOnsAvailable(c)) {
      setProxies(0)
      setNumbers(0)
    }
  }

  const starterQuote = useMemo(() => quote(planList(PLANS.starter), cycle), [cycle])
  const teamListPrice = planList(PLANS.team, seats, profiles)
  const teamQuote = useMemo(
    () => quote(planList(PLANS.team, seats, profiles), cycle),
    [profiles, seats, cycle]
  )

  return {
    cycle,
    setCycle: changeCycle,
    starter: { quote: starterQuote },
    team: {
      profiles,
      setProfiles,
      seats,
      setSeats,
      perProfile: perProfileRate(profiles),
      atMax: profiles >= PF_MAX,
      quote: teamQuote
    },
    addOns: {
      available: addOnsOk,
      proxies,
      setProxies,
      numbers,
      setNumbers,
      list: addOnList
    },
    total: (plan) =>
      quote((plan === 'starter' ? planList(PLANS.starter) : teamListPrice) + addOnList, cycle)
  }
}

/** Seat rate re-exported so the modal can label the add-on without a second import. */
export { SEAT_RATE }
