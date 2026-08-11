import { describe, expect, it } from 'vitest'
import {
  addOnsList,
  PHONE_BUNDLES,
  phoneBundleFor,
  PROXY_BUNDLES,
  proxyBundleAddsValue,
  proxyBundleFor,
  purchasableProxyBundles
} from '../addons.js'
import { addOnsAvailable, ADDONS_IN_CHECKOUT_ENABLED } from '../pricing.js'

describe('bundles worth buying', () => {
  // TubeProxies assigns greatest(0, plan_limit - active_count). A bundle at
  // or below what the customer already holds assigns ZERO proxies while
  // still charging them — observed live: 3 proxies owned, 1-proxy bundle
  // bought, 0 assigned, no error shown.
  it('offers every bundle to a first-time buyer', () => {
    expect(purchasableProxyBundles(0)).toHaveLength(PROXY_BUNDLES.length)
  })

  it('hides bundles the customer already matches or exceeds', () => {
    // Owning 3, the 1-proxy bundle would assign nothing.
    const sizes = purchasableProxyBundles(3).map((b) => b.proxies)
    expect(sizes).not.toContain(1)
    expect(sizes).toContain(5)
  })

  it('hides everything when the customer holds the largest bundle', () => {
    expect(purchasableProxyBundles(100)).toHaveLength(0)
  })

  it('treats an exact match as adding nothing', () => {
    // 25 owned + 25 bundle → greatest(0, 25-25) = 0 assigned.
    expect(proxyBundleAddsValue(25, 25)).toBe(false)
    expect(proxyBundleAddsValue(50, 25)).toBe(true)
  })

  it('offers everything when the owned count is unknown (0)', () => {
    // A failed lookup must never block a legitimate sale.
    expect(proxyBundleAddsValue(1, 0)).toBe(true)
  })
})

describe('add-on availability', () => {
  it('follows the master switch', () => {
    // Whatever the switch is set to, the two must agree — a stale
    // availability check would offer products the checkout then refuses.
    expect(addOnsAvailable('monthly')).toBe(ADDONS_IN_CHECKOUT_ENABLED)
    expect(addOnsAvailable('quarterly')).toBe(ADDONS_IN_CHECKOUT_ENABLED)
  })

  it('NEVER offers add-ons on annual, whatever the switch says', () => {
    // TubeProxies sells no annual proxy or phone price. This exclusion is
    // structural, not a rollout gate, so it must hold in both switch states.
    expect(addOnsAvailable('annual')).toBe(false)
  })
})

describe('bundle lookup', () => {
  it('resolves every advertised proxy size', () => {
    for (const b of PROXY_BUNDLES) expect(proxyBundleFor(b.proxies)).toBe(b)
  })

  it('resolves every advertised phone size', () => {
    for (const b of PHONE_BUNDLES) expect(phoneBundleFor(b.numbers)).toBe(b)
  })

  it('rejects a size that is not a real bundle', () => {
    // These are fixed bundles, not per-unit — 17 proxies is not a product,
    // and letting it through would fail inside Stripe instead of at input.
    expect(proxyBundleFor(17)).toBeNull()
    expect(phoneBundleFor(4)).toBeNull()
  })

  it('treats zero as no selection', () => {
    expect(proxyBundleFor(0)).toBeNull()
    expect(phoneBundleFor(0)).toBeNull()
  })
})

describe('add-on totals', () => {
  it('is zero when nothing is selected', () => {
    expect(addOnsList(0, 0)).toBe(0)
  })

  it('sums the two bundles', () => {
    // 25 proxies ($175) + 3 numbers ($39.99)
    expect(addOnsList(25, 3)).toBeCloseTo(214.99, 2)
  })

  it('ignores a quantity that matches no bundle', () => {
    expect(addOnsList(17, 0)).toBe(0)
  })

  it('matches the TubeProxies catalogue prices', () => {
    // Guards against drift from tubeproxies-dash/src/lib/plans.ts — a
    // mismatch means we quote one price and Stripe charges another.
    expect(proxyBundleFor(1)?.monthly).toBe(8)
    expect(proxyBundleFor(25)?.monthly).toBe(175)
    expect(proxyBundleFor(100)?.monthly).toBe(500)
    expect(phoneBundleFor(1)?.monthly).toBe(14.99)
    expect(phoneBundleFor(15)?.monthly).toBe(187.35)
  })
})
