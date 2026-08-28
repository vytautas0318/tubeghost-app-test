import { describe, it, expect } from 'vitest'
import { rowToSimpleDraft } from '../useSimpleDraft'
import { platformCoherencePatch } from '../platformCoherence'
import { hasCustomAdvanced } from '../hasCustomAdvanced'
import { matchesOptimized, isOptimizedOn, OPTIMIZED_PRESET } from '../optimizedPreset'
import type { ProfileRow } from '@/lib/profiles'

// A hand-tuned profile: custom GPU, non-default fonts, launch args, explicit
// locale/timezone — everything the Simple UI does NOT expose.
const HAND_TUNED = {
  id: 'p-1',
  name: 'Tuned',
  group_id: null,
  tags: ['keep'],
  platform: 'windows',
  platform_version: '15.0.0',
  brand_version: '150.0.0.0',
  user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0',
  fingerprint_seed: 424242,
  webgl_vendor: 'Google Inc. (NVIDIA)',
  webgl_renderer: 'ANGLE (NVIDIA GeForce RTX 3060)',
  hardware_concurrency: 16,
  device_memory: 32,
  google_optimized: false,
  fonts_mode: 'custom',
  launch_args: '--some-flag',
  timezone: 'Europe/Berlin',
  timezone_mode: 'custom',
  language: 'de-DE',
  language_mode: 'custom',
  location_mode: 'custom',
  display_language_mode: 'custom',
  webgpu_mode: 'based_on_webgl',
  webrtc_mode: 'forward',
  noise_canvas: true,
  proxy_host: '1.2.3.4',
  proxy_port: 8080
} as unknown as ProfileRow

describe('Simple editor — non-destructive guarantee', () => {
  it('seeds the draft from the row without altering it', () => {
    const d = rowToSimpleDraft(HAND_TUNED)
    expect(d.name).toBe('Tuned')
    expect(d.platform).toBe('windows')
    expect(d.brand_version_major).toBe('150')
    expect(d.fingerprint_seed).toBe(424242)
    // Derived exactly as Advanced derives it.
    expect(d.webgl_mode).toBe('custom')
  })

  it('never surfaces fields Simple does not expose', () => {
    const d = rowToSimpleDraft(HAND_TUNED) as unknown as Record<string, unknown>
    // If these are absent from the draft they can never reach a write.
    for (const k of [
      'fonts_mode',
      'launch_args',
      'noise_canvas',
      'timezone',
      'language',
      'hardware_concurrency',
      'device_memory',
      'proxy_host',
      'proxy_port'
    ]) {
      expect(d[k]).toBeUndefined()
    }
  })

  it('treats a missing row as a safe default rather than throwing', () => {
    const d = rowToSimpleDraft(null)
    // New profiles default to macOS (both here and in bulk create).
    expect(d.platform).toBe('macos')
    expect(d.name).toBe('')
  })

  it('shows the YouTube preset as ON while creating a profile', () => {
    // REGRESSION: on create there is no row, and google_optimized used to seed
    // false — so the toggle rendered OFF even though every preset field
    // defaults to its preset value and createProfile() persists true.
    const d = rowToSimpleDraft(null)
    expect(matchesOptimized(d)).toBe(true)
    expect(isOptimizedOn(d)).toBe(true)
  })
})

describe('Optimized-for-YouTube toggle', () => {
  it('reads ON for a default profile, regardless of the GPU', () => {
    // The preset is locale/WebRTC/WebGPU only, so a fresh profile on the REAL
    // host GPU (webgl_vendor NULL) still counts as optimized. Forcing a
    // same-platform Custom GPU would be a detection risk, so the preset must
    // never require one.
    const d = rowToSimpleDraft({
      ...HAND_TUNED,
      webgl_vendor: null,
      webrtc_mode: 'forward',
      timezone_mode: 'based_on_ip',
      language_mode: 'based_on_ip',
      location_mode: 'based_on_ip',
      display_language_mode: 'based_on_language',
      webgpu_mode: 'based_on_webgl'
    } as ProfileRow)
    expect(d.webgl_mode).toBe('real')
    expect(matchesOptimized(d)).toBe(true)
  })

  it('reads OFF when a preset-controlled field is hand-tuned away', () => {
    const d = rowToSimpleDraft({ ...HAND_TUNED, timezone_mode: 'custom' } as ProfileRow)
    expect(matchesOptimized(d)).toBe(false)
  })
})

describe('the toggle can actually be turned off', () => {
  const optimizedRow = {
    ...HAND_TUNED,
    webgl_vendor: null,
    google_optimized: true,
    webrtc_mode: 'forward',
    timezone_mode: 'based_on_ip',
    language_mode: 'based_on_ip',
    location_mode: 'based_on_ip',
    display_language_mode: 'based_on_language',
    webgpu_mode: 'based_on_webgl'
  } as ProfileRow

  it('reads ON when the user opted in and the fields still match', () => {
    expect(isOptimizedOn(rowToSimpleDraft(optimizedRow))).toBe(true)
  })

  it('reads OFF once the stored flag is cleared', () => {
    // REGRESSION: the toggle used to derive purely from matchesOptimized(), so
    // clearing the flag changed nothing and the switch sprang straight back on
    // — the preset's fields are also the app's defaults.
    const off = { ...rowToSimpleDraft(optimizedRow), google_optimized: false }
    expect(matchesOptimized(off)).toBe(true) // fields unchanged...
    expect(isOptimizedOn(off)).toBe(false) // ...but the toggle is off
  })

  it('reads OFF when a controlled field is hand-edited, even while opted in', () => {
    const edited = { ...rowToSimpleDraft(optimizedRow), timezone_mode: 'custom' }
    expect(edited.google_optimized).toBe(true)
    expect(isOptimizedOn(edited)).toBe(false)
  })
})

describe('create and "New fingerprint" agree', () => {
  it('a created profile carries a Custom GPU / cores / RAM, like New fingerprint', () => {
    // createProfile() used to persist NULL for these (= real host device) while
    // "New fingerprint" wrote the archetype's Custom values, so the two paths
    // produced different KINDS of profile. Verified 2026-08-12 on an arm64 DMG
    // (Apple Silicon) that Custom passes, so create now matches.
    const created = {
      ...HAND_TUNED,
      webgl_vendor: 'Google Inc. (NVIDIA)',
      webgl_renderer: 'ANGLE (NVIDIA GeForce RTX 3060)',
      hardware_concurrency: 16,
      device_memory: 32
    } as ProfileRow
    const d = rowToSimpleDraft(created)
    expect(d.webgl_mode).toBe('custom')
    expect(d.webgl_vendor).toBe('Google Inc. (NVIDIA)')
  })

  it('does not flag a freshly-created profile as having custom advanced settings', () => {
    // hasCustomAdvanced keyed off a non-null webgl_vendor. With create now
    // writing one, that would have shown the "custom settings preserved" note
    // on every single profile.
    expect(
      hasCustomAdvanced({
        ...HAND_TUNED,
        webgl_vendor: 'Google Inc. (NVIDIA)',
        hardware_concurrency: 16,
        device_memory: 32,
        fonts_mode: 'default',
        launch_args: null
      } as ProfileRow)
    ).toBe(false)
  })
})

describe('OPTIMIZED_PRESET contents', () => {
  it('never controls webgl_mode', () => {
    // GUARD. Adding webgl_mode back would make the toggle force a spoofed GPU
    // string while the real GPU still renders canvas/WebGL pixels and reports
    // the real WebGPU adapter — a string-vs-hardware contradiction that reads
    // as "browser tampering" on same-platform profiles. See the
    // same-platform-real-gpu findings. Custom GPU is a cross-platform,
    // explicitly-opted-in Advanced choice, never a side effect of this preset.
    expect(Object.keys(OPTIMIZED_PRESET)).not.toContain('webgl_mode')
    expect(Object.keys(OPTIMIZED_PRESET)).not.toContain('webgl_vendor')
    expect(Object.keys(OPTIMIZED_PRESET)).not.toContain('webgl_renderer')
  })
})

describe('platform coherence', () => {
  it('is a no-op when the platform already agrees', () => {
    const patch = platformCoherencePatch({
      platform: 'windows',
      webgl_vendor: 'Google Inc. (NVIDIA)',
      brand_version_major: '150',
      platform_version: '15.0.0',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0'
    })
    expect(patch).toEqual({})
  })

  it('moves only the fields the new platform actually invalidates', () => {
    // Windows → macOS: the Windows OS version and the Windows UA must move.
    const patch = platformCoherencePatch({
      platform: 'macos',
      webgl_vendor: 'Apple',
      brand_version_major: '150',
      platform_version: '15.0.0', // valid on BOTH (Win 11 / macOS 15)
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0'
    })
    // UA disagrees with macOS → regenerated.
    expect(patch.user_agent).toContain('Macintosh')
    // Nothing else needed to move.
    expect(patch.brand_version_major).toBeUndefined()
  })

  it('does not regenerate a blank user agent', () => {
    const patch = platformCoherencePatch({
      platform: 'macos',
      webgl_vendor: 'Apple',
      brand_version_major: '150',
      platform_version: '',
      user_agent: ''
    })
    expect(patch.user_agent).toBeUndefined()
  })
})
