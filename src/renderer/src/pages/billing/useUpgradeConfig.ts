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
  applyCycle,
  billedTotal,
  perProfileRate,
  PF_MAX,
  PF_MIN,
<<<<<<< HEAD
  PLANS,
  planList,
  SEAT_RATE,
=======
  SEAT_RATE,
  STARTER_BASE,
  teamList,
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
  type Cycle
} from '@shared/pricing'

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
<<<<<<< HEAD
  // TOTAL member count, matching the marketing stepper — it floors at the
  // plan's included seats and only bills beyond them. Seeded from live usage
  // so an existing team of 5 opens at 5, not at the 3 included.
  const [seats, setSeats] = useState(
    Math.max(PLANS.team.seatsIncluded, usage.seatsUsed)
  )

  const starterQuote = useMemo(() => quote(planList(PLANS.starter), cycle), [cycle])
  const teamQuote = useMemo(
    () => quote(planList(PLANS.team, seats, profiles), cycle),
=======
  // Starter includes one seat; only ADDITIONAL seats are billed on Team, so
  // a workspace with 1 member configures 0 extra seats.
  const [seats, setSeats] = useState(Math.max(0, usage.seatsUsed - 1))

  const starterQuote = useMemo(() => quote(STARTER_BASE, cycle), [cycle])
  const teamQuote = useMemo(
    () => quote(teamList(profiles, seats), cycle),
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
    [profiles, seats, cycle]
  )

  return {
    cycle,
    setCycle,
    starter: { quote: starterQuote },
    team: {
      profiles,
      setProfiles,
      seats,
      setSeats,
      perProfile: perProfileRate(profiles),
      atMax: profiles >= PF_MAX,
      quote: teamQuote
    }
  }
}

/** Seat rate re-exported so the modal can label the add-on without a second import. */
export { SEAT_RATE }
