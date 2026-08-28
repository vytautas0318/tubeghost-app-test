// "Is this card what the workspace already pays for?"
//
// ONE definition, shared by every billing surface, so the upgrade modal, the
// settings billing panel and anything added later cannot disagree about what
// counts as the current plan.
//
// The subtlety is Team: it is a CONFIGURATOR, so being on Team is not enough
// to call the card current. A Team customer on 100 profiles who drags the
// stepper to 200 is making a real purchase, and that button must stay live.
// The card is only "current" when plan, profile count, seat count AND billing
// cycle all match what is already being paid for — change any one and it
// becomes a genuine upgrade or downgrade.
//
// Fixed plans (Starter) ignore the configurator fields: there is nothing to
// vary, so plan + cycle is the whole identity.

import type { PlanCycle } from '@shared/pricing'

export interface CurrentSubscription {
  /** plan_key of the active plan: 'free' | 'starter' | 'team'. */
  planId: string
  /** Effective purchased profile capacity. */
  profiles: number | null
  /** Total seats being paid for (included + extra). */
  seats: number | null
  cycle: PlanCycle
}

export interface CardSelection {
  planKey: string
  /** Configured profile count; ignored for fixed plans. */
  profiles: number
  /** Configured seat count; ignored for fixed plans. */
  seats: number
  cycle: PlanCycle
  /** True for Team — the only plan whose capacity the buyer configures. */
  configurable: boolean
}

/**
 * True when buying this card would charge the customer for exactly what they
 * already have. Such a purchase is never useful, so the CTA is disabled and
 * relabelled "Current plan".
 */
export function isCurrentPlan(current: CurrentSubscription | null, card: CardSelection): boolean {
  // No subscription (or it failed to load) — never claim a card is current.
  // Wrongly disabling the buy button blocks a sale; wrongly enabling it at
  // worst shows a no-op checkout. Fail toward letting people pay.
  if (!current) return false

  // A cancelled or lapsed subscription is not "current" — re-subscribing to
  // the identical plan is exactly what those customers need to do.
  if (current.planId !== card.planKey) return false

  // Cycle is part of the deal on every plan: monthly → annual is a real change.
  if (current.cycle !== card.cycle) return false

  // Fixed plans have nothing left to compare.
  if (!card.configurable) return true

  // Team: capacity must match too. Unknown capacity (null) means the read
  // failed, so don't disable on a guess.
  if (current.profiles == null || current.seats == null) return false
  return current.profiles === card.profiles && current.seats === card.seats
}

/**
 * The CTA label for a card.
 *
 * `hasActivePlan` means the workspace already pays for something, so the button
 * opens Stripe's billing portal rather than a new checkout — a second
 * subscription would bill for both. "Change plan" says what actually happens;
 * "Choose Team" would promise a purchase the click does not make.
 */
export function ctaLabel(
  isCurrent: boolean,
  busy: boolean,
  planName: string,
  hasActivePlan = false
): string {
  if (busy) return 'Starting…'
  if (isCurrent) return 'Current plan'
  if (hasActivePlan) return 'Change plan'
  return `Choose ${planName}`
}

/** "6 September 2026" — Intl, so it follows the user's locale. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}
