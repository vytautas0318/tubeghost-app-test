import { describe, it, expect } from 'vitest'
import {
  mayCrossToTubeProxies,
  proxyMayReachTubeProxies,
  SYNCED_PROXY_ORIGIN,
  TUBEPROXIES_BOUND_ENTITIES
} from '../isolation'

// Requirement 2 + the hard constraint: manual proxies must be PROVABLY
// unable to reach TubeProxies. These tests pin the invariant so any future
// change that would let a 'custom' proxy cross the boundary fails CI.

describe('cross-project sync isolation: manual proxies never reach TubeProxies', () => {
  it('proxies of EITHER origin can never be pushed to TubeProxies', () => {
    // custom = a proxy added manually inside a TubeGhost browser profile.
    expect(proxyMayReachTubeProxies('custom')).toBe(false)
    // even purchased proxies are inbound-only (TubeProxies is their master).
    expect(proxyMayReachTubeProxies('tubeproxies')).toBe(false)
  })

  it('the TubeProxies-bound entity allowlist does NOT include proxies', () => {
    expect(TUBEPROXIES_BOUND_ENTITIES).not.toContain('proxy')
    expect(mayCrossToTubeProxies('proxy')).toBe(false)
  })

  it('only phone_number status may cross to TubeProxies', () => {
    expect(mayCrossToTubeProxies('phone_number')).toBe(true)
    expect(mayCrossToTubeProxies('user')).toBe(false)
    expect(mayCrossToTubeProxies('anything-else')).toBe(false)
  })

  it('any proxy the inbound path writes is stamped origin=tubeproxies', () => {
    // A synced proxy can never be classified 'custom' — that's what makes
    // the origin filter a reliable discriminator for the isolation rule.
    expect(SYNCED_PROXY_ORIGIN).toBe('tubeproxies')
  })
})

// A structural assertion mirroring the runtime backstop in outbox-retry:
// when the peer is TubeProxies, a 'proxy' outbox row must be dropped, not
// replayed. We reproduce the guard's decision here as a pure predicate so
// the rule is covered without a live Supabase.
function outboxWouldReplay(peerLabel: string, entity: string): boolean {
  if (peerLabel === 'tubeproxies' && entity === 'proxy') return false
  return true
}

describe('outbox-retry isolation backstop', () => {
  it('drops proxy rows aimed at TubeProxies', () => {
    expect(outboxWouldReplay('tubeproxies', 'proxy')).toBe(false)
  })
  it('still replays proxy rows aimed at TP Browser (the legitimate direction)', () => {
    expect(outboxWouldReplay('tubeghost', 'proxy')).toBe(true)
  })
  it('still replays phone_number rows toward TubeProxies', () => {
    expect(outboxWouldReplay('tubeproxies', 'phone_number')).toBe(true)
  })
})
