import { describe, expect, it } from 'vitest'
import { cartProducts, parseCart, productLabel, type Cart } from '../cart.js'

const base: Cart = {
  workspaceId: 'ws_1',
  plan: 'team',
  cycle: 'monthly',
  profiles: 100,
  seats: 3,
  proxies: 0,
  numbers: 0
}

describe('cart → products', () => {
  it('always includes the plan', () => {
    expect(cartProducts(base)).toEqual(['profile_plan'])
  })

  it('adds a product per selected add-on', () => {
    expect(cartProducts({ ...base, proxies: 25 })).toEqual(['profile_plan', 'proxy'])
    expect(cartProducts({ ...base, numbers: 3 })).toEqual(['profile_plan', 'phone_number'])
    expect(cartProducts({ ...base, proxies: 25, numbers: 3 })).toEqual([
      'profile_plan',
      'proxy',
      'phone_number'
    ])
  })

  it('creates the plan FIRST', () => {
    // The failure policy depends on this: if the plan cannot be charged the
    // order is abandoned, and nothing else should exist by then.
    expect(cartProducts({ ...base, proxies: 50, numbers: 7 })[0]).toBe('profile_plan')
  })

  it('omits zero-quantity add-ons', () => {
    expect(cartProducts({ ...base, proxies: 0, numbers: 0 })).toHaveLength(1)
  })

  it('labels every product', () => {
    for (const p of cartProducts({ ...base, proxies: 25, numbers: 3 })) {
      expect(productLabel(p).length).toBeGreaterThan(0)
    }
  })
})

describe('cart round-trip through Stripe metadata', () => {
  // The cart survives as a JSON string on the SetupIntent, then comes back
  // when the webhook fulfils it. A parse failure there would mean a paid
  // customer receives nothing, so the tolerant path matters.
  it('survives serialisation', () => {
    const cart = { ...base, proxies: 25, numbers: 3 }
    expect(parseCart(JSON.stringify(cart))).toEqual(cart)
  })

  it('defaults missing quantities to zero rather than NaN', () => {
    const parsed = parseCart('{"workspaceId":"ws_1","plan":"starter","cycle":"annual"}')
    expect(parsed).not.toBeNull()
    expect(parsed?.profiles).toBe(0)
    expect(parsed?.proxies).toBe(0)
  })

  it('returns null on unusable input instead of throwing', () => {
    expect(parseCart(undefined)).toBeNull()
    expect(parseCart('not json')).toBeNull()
    expect(parseCart('{}')).toBeNull()
    // Missing the workspace it would be applied to.
    expect(parseCart('{"plan":"team","cycle":"monthly"}')).toBeNull()
  })
})
