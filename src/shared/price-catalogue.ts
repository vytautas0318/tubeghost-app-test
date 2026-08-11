// The one place a Stripe price ID is named.
//
// Every product/cycle pair resolves through here, so a price can never be
// hardcoded at a call site and drift. Env-var NAMES live here; the VALUES
// stay in the environment because a price ID differs between Stripe test and
// live mode — committing one guarantees a production mismatch.
//
// Three product families, two owners:
//   plan / profiles / seat  → TubeGhost's own prices (TG_PRICE_*)
//   proxy / phone bundles   → TubeProxies' prices (NEXT_PUBLIC_PRICE_*),
//                             same Stripe account, their products
//
// Proxies and numbers have MONTHLY and QUARTERLY only. There is no annual
// price for them, which is why an annual plan cannot include add-ons.

export type ProductType = 'profile_plan' | 'proxy' | 'phone_number'
export type CatalogueCycle = 'monthly' | 'quarterly' | 'annual'

/** Env var holding the price for a TubeGhost plan component. */
const GHOST_ENV = {
  starter: {
    monthly: 'TG_PRICE_STARTER_MONTHLY',
    quarterly: 'TG_PRICE_STARTER_QUARTERLY',
    annual: 'TG_PRICE_STARTER_ANNUAL'
  },
  profiles: {
    monthly: 'TG_PRICE_PROFILES_MONTHLY',
    quarterly: 'TG_PRICE_PROFILES_QUARTERLY',
    annual: 'TG_PRICE_PROFILES_ANNUAL'
  },
  seat: {
    monthly: 'TG_PRICE_SEAT_MONTHLY',
    quarterly: 'TG_PRICE_SEAT_QUARTERLY',
    annual: 'TG_PRICE_SEAT_ANNUAL'
  }
} as const

export type GhostPriceKind = keyof typeof GHOST_ENV

/** TubeProxies proxy bundles, keyed by bundle size. No annual. */
const PROXY_ENV: Record<number, { monthly: string; quarterly: string }> = {
  1: {
    monthly: 'NEXT_PUBLIC_PRICE_STARTER_MONTHLY',
    quarterly: 'NEXT_PUBLIC_PRICE_STARTER_QUARTERLY'
  },
  5: {
    monthly: 'NEXT_PUBLIC_PRICE_HOBBY_MONTHLY',
    quarterly: 'NEXT_PUBLIC_PRICE_HOBBY_QUARTERLY'
  },
  10: {
    monthly: 'NEXT_PUBLIC_PRICE_SMALL_TEAM_MONTHLY',
    quarterly: 'NEXT_PUBLIC_PRICE_SMALL_TEAM_QUARTERLY'
  },
  25: {
    monthly: 'NEXT_PUBLIC_PRICE_GROWTH_MONTHLY',
    quarterly: 'NEXT_PUBLIC_PRICE_GROWTH_QUARTERLY'
  },
  50: {
    monthly: 'NEXT_PUBLIC_PRICE_SCALE_MONTHLY',
    quarterly: 'NEXT_PUBLIC_PRICE_SCALE_QUARTERLY'
  },
  100: {
    monthly: 'NEXT_PUBLIC_PRICE_ENTERPRISE_MONTHLY',
    quarterly: 'NEXT_PUBLIC_PRICE_ENTERPRISE_QUARTERLY'
  }
}

/** TubeProxies phone bundles, keyed by bundle size. No annual. */
const PHONE_ENV: Record<number, { monthly: string; quarterly: string }> = {
  1: {
    monthly: 'NEXT_PUBLIC_PRICE_PHONE_QTY_1',
    quarterly: 'NEXT_PUBLIC_PRICE_PHONE_QTY_1_QUARTERLY'
  },
  3: {
    monthly: 'NEXT_PUBLIC_PRICE_PHONE_QTY_3',
    quarterly: 'NEXT_PUBLIC_PRICE_PHONE_QTY_3_QUARTERLY'
  },
  7: {
    monthly: 'NEXT_PUBLIC_PRICE_PHONE_QTY_7',
    quarterly: 'NEXT_PUBLIC_PRICE_PHONE_QTY_7_QUARTERLY'
  },
  15: {
    monthly: 'NEXT_PUBLIC_PRICE_PHONE_QTY_15',
    quarterly: 'NEXT_PUBLIC_PRICE_PHONE_QTY_15_QUARTERLY'
  }
}

/** Reads an env var by name. Server-only — never call this in the renderer. */
type EnvReader = (name: string) => string | undefined

export function ghostPrice(
  kind: GhostPriceKind,
  cycle: CatalogueCycle,
  env: EnvReader
): string {
  return env(GHOST_ENV[kind][cycle]) ?? ''
}

export function proxyPrice(size: number, cycle: CatalogueCycle, env: EnvReader): string {
  if (cycle === 'annual') return ''
  const row = PROXY_ENV[size]
  return row ? (env(row[cycle]) ?? '') : ''
}

export function phonePrice(size: number, cycle: CatalogueCycle, env: EnvReader): string {
  if (cycle === 'annual') return ''
  const row = PHONE_ENV[size]
  return row ? (env(row[cycle]) ?? '') : ''
}

/** Bundle sizes the catalogue knows about — for validating a request. */
export const PROXY_SIZES = Object.keys(PROXY_ENV).map(Number)
export const PHONE_SIZES = Object.keys(PHONE_ENV).map(Number)

/** Env var names a plan+cycle needs, for a clear "not configured" error. */
export function requiredGhostVars(
  plan: 'starter' | 'team',
  cycle: CatalogueCycle
): string[] {
  const kinds: GhostPriceKind[] = plan === 'starter' ? ['starter'] : ['profiles', 'seat']
  return kinds.map((k) => GHOST_ENV[k][cycle])
}
