// Cross-project sync isolation rules — the SINGLE source of truth for
// "what may cross to TubeProxies". Imported by the isolation test and
// (conceptually) mirrored by the edge functions' behaviour.
//
// Requirement 2 + the hard constraint: a proxy added MANUALLY inside a
// browser profile in TubeGhost (source='custom') must be PROVABLY unable
// to reach TubeProxies. We encode that as data here so it is testable.

// TP Browser proxy origin discriminator (the existing `source` column).
export type ProxyOrigin = 'tubeproxies' | 'custom'

// Entities that a TP-Browser -> TubeProxies sync path is allowed to
// carry. Proxies are DELIBERATELY absent: proxy sync is one-way
// (TubeProxies -> TP Browser) only. Phone numbers may cross (status).
export const TUBEPROXIES_BOUND_ENTITIES = ['phone_number'] as const
export type TubeProxiesBoundEntity = (typeof TUBEPROXIES_BOUND_ENTITIES)[number]

// May this entity, going FROM TP Browser TO TubeProxies, be synced at all?
export function mayCrossToTubeProxies(entity: string): boolean {
  return (TUBEPROXIES_BOUND_ENTITIES as readonly string[]).includes(entity)
}

// Given a TP Browser proxy row's origin, may it EVER be pushed to
// TubeProxies? Manual ('custom') proxies: never. Purchased
// ('tubeproxies') proxies: also never pushed (TubeProxies is their
// master; sync is inbound only) — so the answer is always false for
// proxies. This function makes the invariant explicit and total.
export function proxyMayReachTubeProxies(_origin: ProxyOrigin): boolean {
  return false
}

// Origin the sync-proxy-status inbound path must stamp on every proxy it
// writes into TP Browser. A synced proxy is ALWAYS 'tubeproxies' — it can
// never masquerade as (or be reclassified to) 'custom'.
export const SYNCED_PROXY_ORIGIN: ProxyOrigin = 'tubeproxies'
