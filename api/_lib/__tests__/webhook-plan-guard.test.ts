import { describe, expect, it } from 'vitest'

/**
 * Regression guard: only the PLAN subscription may write the workspace.
 *
 * The single-page checkout creates three subscriptions — plan, proxies,
 * numbers — and all three are ours. But applySubscription() writes
 * `plan`, `purchased_profiles` and `stripe_subscription_id`, which only the
 * plan describes.
 *
 * Observed live: a phone subscription reached that path, so the workspace
 * ended up with plan 'free', purchased_profiles null, and the PHONE
 * subscription id — a paying customer silently downgraded.
 *
 * `plan_key` is the discriminator. Proxy and phone subscriptions carry
 * TubeProxies' metadata shape and never have it.
 */

const PRODUCT_TAG = 'tubeghost'

/** Mirrors isOurs() in handlers/billing/webhook.ts. */
function isOurs(metadata: Record<string, string> | undefined): boolean {
  return metadata?.product === PRODUCT_TAG && Boolean(metadata?.plan_key)
}

// Exactly what fulfil.ts attaches to each subscription it creates.
const PLAN_META = {
  product: 'tubeghost',
  user_id: 'u1',
  workspace_id: 'ws1',
  plan_key: 'team',
  cycle: 'monthly',
  profile_quota: '300',
  seat_quota: '5'
}
const PROXY_META = {
  user_id: 'u1',
  proxy_count: '5',
  plan_name: 'Hobby',
  origin: 'tubeghost'
}
const PHONE_META = {
  type: 'phone_number',
  user_id: 'u1',
  phone_quantity: '1',
  origin: 'tubeghost'
}

describe('plan-subscription guard', () => {
  it('accepts the plan subscription', () => {
    expect(isOurs(PLAN_META)).toBe(true)
  })

  it('rejects the proxy subscription we created', () => {
    // Ours, but it describes no workspace entitlement.
    expect(isOurs(PROXY_META)).toBe(false)
  })

  it('rejects the phone subscription we created', () => {
    expect(isOurs(PHONE_META)).toBe(false)
  })

  it('rejects a TubeProxies-originated purchase', () => {
    expect(isOurs({ proxy_count: '25', plan_name: 'Growth', user_id: 'u1' })).toBe(false)
  })

  it('rejects our tag without a plan_key', () => {
    // The exact shape that caused the downgrade: tagged as ours, but with
    // nothing describing which plan — applySubscription would have fallen
    // back to 'free'.
    expect(isOurs({ product: 'tubeghost', user_id: 'u1' })).toBe(false)
  })

  it('rejects a plan_key without our tag', () => {
    // Another product could use the same key name; the tag must also match.
    expect(isOurs({ plan_key: 'team', user_id: 'u1' })).toBe(false)
  })

  it('rejects missing metadata entirely', () => {
    expect(isOurs(undefined)).toBe(false)
    expect(isOurs({})).toBe(false)
  })
})
