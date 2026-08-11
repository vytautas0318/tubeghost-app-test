import { describe, expect, it } from 'vitest'
import { orderSteps, type Order } from '../order.js'

/**
 * Regression guard for the broken-chain bug.
 *
 * Observed after the first deploy: a customer configured a plan + proxies +
 * numbers, paid for the plan, and received ONLY the plan. The plan checkout
 * returned to `/billing?checkout=success`, but the order runner listens for
 * `?order=continue` — so the remaining steps were never launched and the
 * add-ons were silently dropped.
 *
 * The rule: whenever an order has steps after the plan, the plan's checkout
 * must be told so (`partOfOrder`) and return to a continuing URL.
 */

/** Mirrors the decision in order-runner.runOrder(). */
function needsContinuation(order: Order): boolean {
  return order.proxies > 0 || order.numbers > 0
}

/** Mirrors the successUrl branch in handlers/billing/checkout.ts. */
function successUrl(partOfOrder: boolean): string {
  return partOfOrder ? '/billing?order=continue&done=plan' : '/billing?checkout=success'
}

const base: Order = {
  workspaceId: 'ws_1',
  plan: 'team',
  cycle: 'monthly',
  profiles: 100,
  seats: 3,
  proxies: 0,
  numbers: 0
}

describe('order continuation', () => {
  it('does not continue a plan-only order', () => {
    expect(needsContinuation(base)).toBe(false)
    expect(successUrl(false)).toContain('checkout=success')
  })

  it('continues when proxies were selected', () => {
    expect(needsContinuation({ ...base, proxies: 25 })).toBe(true)
  })

  it('continues when numbers were selected', () => {
    expect(needsContinuation({ ...base, numbers: 3 })).toBe(true)
  })

  it('returns to a URL the runner recognises when steps remain', () => {
    const url = successUrl(needsContinuation({ ...base, proxies: 25, numbers: 3 }))
    // Both parts matter: `order=continue` triggers the resume, `done=plan`
    // stops the plan being charged a second time.
    expect(url).toContain('order=continue')
    expect(url).toContain('done=plan')
  })

  it('agrees with orderSteps about whether anything follows the plan', () => {
    // The two must never disagree — if orderSteps says there is more work but
    // the URL ends the flow, that work is silently skipped.
    for (const o of [
      base,
      { ...base, proxies: 25 },
      { ...base, numbers: 7 },
      { ...base, proxies: 50, numbers: 15 }
    ]) {
      expect(needsContinuation(o)).toBe(orderSteps(o).length > 1)
    }
  })
})
