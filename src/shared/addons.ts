// Proxy + phone-number add-ons, for the bundled checkout.
//
// These are TubeProxies products. We mirror their catalogue so the
// configurator can quote a combined total, but TubeProxies provisions and
// owns them — the source of truth is tubeproxies-dash/src/lib/plans.ts and
// phone-plans.ts. Keep quantities and prices in step with those files; a
// mismatch means we quote one number and Stripe charges another.
//
// Both are sold as fixed BUNDLES, not per-unit: you buy the 25-proxy plan,
// not 17 proxies. That is why these are lists of discrete options rather
// than a stepper range.

/** A proxy bundle. `name` is the dashboard's plan name and must match exactly. */
export interface ProxyBundle {
  name: string
  proxies: number
  /** Monthly price for the whole bundle. */
  monthly: number
  /** Team seats the bundle grants on the TubeProxies side (display only). */
  members?: number
}

export const PROXY_BUNDLES: ProxyBundle[] = [
  { name: 'Starter', proxies: 1, monthly: 8 },
  { name: 'Hobby', proxies: 5, monthly: 39 },
  { name: 'Small Team', proxies: 10, monthly: 75 },
  { name: 'Growth', proxies: 25, monthly: 175 },
  { name: 'Scale', proxies: 50, monthly: 325, members: 2 },
  { name: 'Enterprise', proxies: 100, monthly: 500, members: 10 }
]

/** A phone-number bundle. */
export interface PhoneBundle {
  numbers: number
  /** Monthly price for the whole bundle. */
  monthly: number
  /** Effective per-number price, for the "/ea" hint. */
  perNumber: number
  popular?: boolean
}

export const PHONE_BUNDLES: PhoneBundle[] = [
  { numbers: 1, monthly: 14.99, perNumber: 14.99 },
  { numbers: 3, monthly: 39.99, perNumber: 13.33, popular: true },
  { numbers: 7, monthly: 90.93, perNumber: 12.99 },
  { numbers: 15, monthly: 187.35, perNumber: 12.49 }
]

/** Quarterly is 10% off on both, matching TubeProxies' own cycles. */
export const ADDON_QUARTERLY_MULT = 0.9

export function proxyBundleFor(proxies: number): ProxyBundle | null {
  return PROXY_BUNDLES.find((b) => b.proxies === proxies) ?? null
}

export function phoneBundleFor(numbers: number): PhoneBundle | null {
  return PHONE_BUNDLES.find((b) => b.numbers === numbers) ?? null
}

/**
 * Combined monthly list price of the selected add-ons, before any cycle
 * discount. Zero when nothing is selected.
 */
export function addOnsList(proxies: number, numbers: number): number {
  return (proxyBundleFor(proxies)?.monthly ?? 0) + (phoneBundleFor(numbers)?.monthly ?? 0)
}
