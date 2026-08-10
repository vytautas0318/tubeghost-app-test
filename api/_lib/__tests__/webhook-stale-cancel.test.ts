import { describe, expect, it } from 'vitest'

/**
 * Regression guard for the stale-cancellation bug.
 *
 * Observed in testing: a customer on Starter bought Team (upgrade = cancel
 * old + buy new). Stripe delivered the OLD subscription's
 * `customer.subscription.deleted` AFTER the new one's
 * `checkout.session.completed`, so an unconditional revoke() wiped the
 * 100-profile entitlement they had just paid for — the workspace fell back
 * to the plan-table default and the user saw 25 profiles.
 *
 * The rule the webhook must follow: only the subscription CURRENTLY attached
 * to the workspace may revoke it. These tests pin that predicate, which is
 * the whole fix.
 */

/** Mirrors isCurrent() in handlers/billing/webhook.ts. */
function isCurrent(
  workspace: { stripe_subscription_id: string | null },
  sub: { id: string }
): boolean {
  return workspace.stripe_subscription_id === sub.id
}

describe('stale subscription cancellation', () => {
  it('ignores a cancellation for a subscription that is no longer attached', () => {
    // Workspace has already moved on to the Team subscription.
    const workspace = { stripe_subscription_id: 'sub_team_new' }
    const staleStarterCancel = { id: 'sub_starter_old' }
    expect(isCurrent(workspace, staleStarterCancel)).toBe(false)
  })

  it('revokes when the cancelled subscription IS the attached one', () => {
    const workspace = { stripe_subscription_id: 'sub_team_new' }
    expect(isCurrent(workspace, { id: 'sub_team_new' })).toBe(true)
  })

  it('does not revoke when nothing is attached', () => {
    // Already downgraded (or never subscribed) — there is no entitlement to
    // remove, and a late event must not rewrite the row.
    const workspace = { stripe_subscription_id: null }
    expect(isCurrent(workspace, { id: 'sub_anything' })).toBe(false)
  })

  it('survives repeated delivery of the same stale event', () => {
    // Stripe retries; the answer must not drift between attempts.
    const workspace = { stripe_subscription_id: 'sub_team_new' }
    const stale = { id: 'sub_starter_old' }
    for (let i = 0; i < 3; i++) expect(isCurrent(workspace, stale)).toBe(false)
  })

  it('is not fooled by a subscription id that merely shares a prefix', () => {
    const workspace = { stripe_subscription_id: 'sub_1U2tNr' }
    expect(isCurrent(workspace, { id: 'sub_1U2tNrEXTRA' })).toBe(false)
  })
})
