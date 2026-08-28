// Configurator state for the upgrade modal.
//
// Mirrors the marketing pricing table: Starter is fixed (10 profiles, solo),
// Team is a configurator where you pick your profile capacity and how many
// members you need. Every price comes from the shared pricing module; no math
// lives in the components.

import { useMemo, useState } from 'react'
import {
  PF_MAX,
  PF_MIN,
  PLANS,
  planQuote,
  type PlanCycle,
  type PlanDef,
  type PlanQuote
} from '@shared/pricing'
import type { BillingUsage } from './types'

export type Quote = PlanQuote

/** Hard ceiling on the seat stepper; above this it's a sales conversation. */
export const MAX_MEMBERS = 50

export interface PlanConfig {
  plan: PlanDef
  /** Total members seated, including those bundled in the price. */
  members: number
  setMembers: (n: number) => void
  /** Lowest seat count this workspace may buy (included, or what it uses). */
  minMembers: number
  /** Profile capacity being bought. Fixed plans report their included count. */
  profiles: number
  setProfiles: (n: number) => void
  /** Lowest profile count this workspace may buy. */
  minProfiles: number
  atMaxProfiles: boolean
  /** Seats billed on top of the price. */
  extraSeats: number
  quote: Quote
}

export interface UpgradeConfig {
  cycle: PlanCycle
  setCycle: (c: PlanCycle) => void
  starter: PlanConfig
  team: PlanConfig
}

export function useUpgradeConfig(usage: BillingUsage): UpgradeConfig {
  const [cycle, setCycle] = useState<PlanCycle>('monthly')

  // Floors, derived every render rather than seeded into useState: usage
  // arrives asynchronously, so a useState initializer would lock in the
  // pre-load zeros and quote a plan too small for the workspace. Taking the
  // max at render time lets the floor rise when the real counts land, without
  // an effect that would fight the user's own stepper input.
  const seatFloor = Math.min(MAX_MEMBERS, Math.max(PLANS.team.seatsIncluded, usage.seatsUsed ?? 0))
  const profileFloor = Math.min(PF_MAX, Math.max(PF_MIN, usage.profilesUsed ?? 0))

  // Open on WHAT THE WORKSPACE ALREADY BUYS, not on a generic default.
  //
  // A Team customer on 200 profiles / 8 seats opening this modal was shown
  // 100 / 3 — the marketing defaults — which reads as a downgrade and hides
  // the configuration they are actually paying for. `seatLimit` and
  // `profileLimit` are the PURCHASED figures; `*Used` is only how much of that
  // is consumed, so seeding from usage understated it too.
  //
  // Null (free plan, or the read failed) falls back to the marketing opening
  // position. Seeded once via useState: after that the steppers belong to the
  // user, and re-deriving would fight their input.
  const [teamMembers, setTeamMembers] = useState(
    Math.min(MAX_MEMBERS, Math.max(seatFloor, usage.seatLimit ?? 0))
  )
  const [teamProfiles, setTeamProfiles] = useState(
    Math.min(PF_MAX, Math.max(100, profileFloor, usage.profileLimit ?? 0))
  )

  const members = Math.max(teamMembers, seatFloor)
  const profiles = Math.max(teamProfiles, profileFloor)

  const starterQuote = useMemo(
    () => planQuote(PLANS.starter, cycle, PLANS.starter.seatsIncluded),
    [cycle]
  )
  const teamQuoteValue = useMemo(
    () => planQuote(PLANS.team, cycle, members, profiles),
    [cycle, members, profiles]
  )

  return {
    cycle,
    setCycle,
    starter: {
      plan: PLANS.starter,
      members: PLANS.starter.seatsIncluded,
      setMembers: () => {},
      minMembers: PLANS.starter.seatsIncluded,
      profiles: PLANS.starter.profiles,
      setProfiles: () => {},
      minProfiles: PLANS.starter.profiles,
      atMaxProfiles: false,
      extraSeats: 0,
      quote: starterQuote
    },
    team: {
      plan: PLANS.team,
      members,
      // Clamped to the floors so the steppers can never quote less capacity
      // than the workspace already occupies — checkout would reject that.
      setMembers: (n) => setTeamMembers(Math.min(MAX_MEMBERS, Math.max(seatFloor, n))),
      minMembers: seatFloor,
      profiles,
      setProfiles: (n) => setTeamProfiles(Math.min(PF_MAX, Math.max(profileFloor, n))),
      minProfiles: profileFloor,
      atMaxProfiles: profiles >= PF_MAX,
      extraSeats: teamQuoteValue.billableSeats,
      quote: teamQuoteValue
    }
  }
}
