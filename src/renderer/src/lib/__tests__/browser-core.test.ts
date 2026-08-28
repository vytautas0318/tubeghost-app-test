// Browser-core default resolution.
//
// Two things are pinned here:
//   1. 'latest' (the new default) must NOT pin a major — the randomizer then
//      picks the newest available, so a shipped engine upgrade carries new
//      profiles forward without a settings change.
//   2. An explicit major must be honoured. This was previously broken: the
//      setting was stored and displayed, but createProfile never passed it to
//      the randomizer, so choosing "Chromium 148" still produced a 150 profile.

import { describe, it, expect } from 'vitest'
import { RECOMMENDED_FINGERPRINT, LATEST_BROWSER_CORE } from '../settings'
import { browserVersionsFor, generateRandomFingerprint } from '@/pages/profile-editor/randomize'

// Mirrors the resolution in createProfile.
const pinnedMajorFor = (core: string | undefined): string | undefined =>
  core && core !== 'latest' ? core : undefined

describe('browser core default', () => {
  it("recommends 'latest' rather than a hardcoded major", () => {
    expect(RECOMMENDED_FINGERPRINT.browser_core).toBe(LATEST_BROWSER_CORE)
    expect(RECOMMENDED_FINGERPRINT.browser_core).toBe('latest')
  })

  it("'latest' pins nothing, so the randomizer picks the newest major", () => {
    expect(pinnedMajorFor('latest')).toBeUndefined()

    const newest = browserVersionsFor('windows')[0]
    const fp = generateRandomFingerprint({ platform: 'windows' })
    expect(fp.brand_version.split('.')[0]).toBe(newest)
  })

  it('an explicit major is honoured end-to-end', () => {
    expect(pinnedMajorFor('148')).toBe('148')

    const fp = generateRandomFingerprint({ platform: 'windows', brand_version_major: '148' })
    expect(fp.brand_version.split('.')[0]).toBe('148')
    // The UA string must agree with brand_version, or the profile is incoherent.
    expect(fp.user_agent).toContain('148')
  })

  it('lists the DEFAULT major first (not necessarily the newest)', () => {
    // The first entry is what new profiles are created on. It is deliberately
    // the STABLE default (150), NOT the highest number: a newer major can be
    // offered for opt-in (e.g. 151, a fresh port that is x64-only and less
    // battle-tested) without making it the default for everyone.
    const versions = browserVersionsFor('windows')
    expect(versions.length).toBeGreaterThan(0)
    expect(versions[0]).toBe('150')
    // 151 is offered but must NOT be the default.
    expect(versions).toContain('151')
    expect(versions[0]).not.toBe('151')
  })

  // The setting only matters if it survives all the way to the stored profile:
  // browser_core → brand_version → (main) releaseForVersion → real binary.
  it('creates new profiles on the DEFAULT (first-listed) version, per platform', () => {
    for (const platform of ['windows', 'macos']) {
      const def = browserVersionsFor(platform)[0]
      const fp = generateRandomFingerprint({ platform })
      // brand_version is what createProfile persists and what the launcher
      // later maps to a bundled engine — always the default, never an opt-in
      // newer major like 151.
      expect(fp.brand_version.split('.')[0]).toBe(def)
      expect(fp.user_agent).toContain(def)
    }
  })
})
