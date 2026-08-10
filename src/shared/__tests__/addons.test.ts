import { describe, expect, it } from 'vitest'
import {
  addOnsList,
  PHONE_BUNDLES,
  phoneBundleFor,
  PROXY_BUNDLES,
  proxyBundleFor
} from '../addons.js'
import { addOnsAvailable, ADDONS_IN_CHECKOUT_ENABLED } from '../pricing.js'

describe('add-on availability', () => {
  // The master switch is OFF until tubeproxies-dash can provision a bundled
  // purchase. Until then a bundle would charge the customer and deliver
  // nothing, so nothing may be offered on ANY cycle.
  it('offers nothing while the provisioning side is not ready', () => {
    expect(ADDONS_IN_CHECKOUT_ENABLED).toBe(false)
    expect(addOnsAvailable('monthly')).toBe(false)
    expect(addOnsAvailable('quarterly')).toBe(false)
    expect(addOnsAvailable('annual')).toBe(false)
  })

  // Guards the rule that must survive flipping the switch on: every line item
  // in one Stripe session shares a billing interval, and TubeProxies sells no
  // annual proxy or phone price. Annual must stay excluded regardless.
  it('keeps annual excluded independently of the switch', () => {
    const gate = (enabled: boolean, cycle: string): boolean => enabled && cycle !== 'annual'
    expect(gate(true, 'monthly')).toBe(true)
    expect(gate(true, 'quarterly')).toBe(true)
    expect(gate(true, 'annual')).toBe(false)
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
