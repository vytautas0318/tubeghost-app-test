// Row-shaped fingerprint patches for the editor's Simple mode.
//
// Simple mode writes fingerprint changes straight to the profile row
// (there is no batched form to flush), so it needs the same field set
// FingerprintCard's "New fingerprint" produces — expressed in DB columns
// rather than the card's internal Form shape.
//
// Both surfaces call generateRandomFingerprint(), so the DEVICE side can't
// drift: it is one generator picking one real, internally-consistent
// device (CPU + RAM + GPU + resolution locked together). Only the mode
// constants below are restated, and they are the same non-"real" defaults
// FingerprintCard applies, for the same reason: a Simple-mode profile must
// never be left leaking the real device.

import { generateRandomFingerprint, randomDeviceName, randomMacAddress } from './randomize'
import { OPTIMIZED_PRESET } from './optimizedPreset'
import type { updateProfile } from '@/lib/profiles'

// Exactly what updateProfile() accepts, so a column it can't write is a
// compile error here rather than a silent no-op at runtime.
export type FingerprintPatch = Parameters<typeof updateProfile>[1]

/**
 * A complete, coherent new fingerprint for `platform`.
 *
 * Used by both "New fingerprint" and the OS switch. The OS switch MUST go
 * through here rather than writing `platform` alone: user_agent, WebGL
 * vendor/renderer, CPU/RAM and resolution are all platform-specific, and a
 * Mac user-agent surviving a switch to Windows trips every fingerprint
 * detector — the exact mismatch FingerprintCard guards against on its own
 * platform-change path.
 */
export function newFingerprintPatch(
  platform: string,
  brandVersion?: string | null
): FingerprintPatch {
  // Callers hand us profile.brand_version, which is the full quad
  // ("150.0.0.0"), but the generator wants the MAJOR — it appends ".0.0.0"
  // itself. Passing the quad through produced "150.0.0.0.0.0.0" and stamped
  // that into the user agent. Narrow it here so no call site can get it
  // wrong.
  const major = (brandVersion ?? '').split('.')[0] || undefined
  const r = generateRandomFingerprint({
    platform,
    brand_version_major: major
  })
  return {
    fingerprint_seed: r.fingerprint_seed,
    platform: r.platform,
    platform_version: r.platform_version,
    brand: r.brand,
    brand_version: r.brand_version,
    user_agent: r.user_agent,
    // WebGL metadata custom (a set vendor IS "custom" mode — the editor
    // derives webgl_mode from whether webgl_vendor is populated).
    webgl_vendor: r.webgl_vendor,
    webgl_renderer: r.webgl_renderer,
    hardware_concurrency: r.hardware_concurrency,
    device_memory: r.device_memory,
    screen_resolution: r.screen_resolution,
    // Locale + network + geo: proxy-aware, never "real".
    timezone_mode: 'based_on_ip',
    language_mode: 'based_on_ip',
    display_language_mode: 'based_on_language',
    webrtc_mode: 'forward',
    location_mode: 'based_on_ip',
    location_prompt: 'ask',
    webgpu_mode: 'based_on_webgl',
    // Hardware noise all on — the seed makes it unique per profile and
    // reproducible for the same profile.
    noise_canvas: r.noise_canvas,
    noise_webgl_image: r.noise_webgl_image,
    noise_audiocontext: r.noise_audiocontext,
    noise_media_device: r.noise_media_device,
    noise_clientrects: r.noise_clientrects,
    noise_speechvoices: r.noise_speechvoices,
    // Re-randomized so two presses never collide.
    device_name: randomDeviceName(r.platform),
    mac_address: randomMacAddress(),
    port_scan_protection: true
  }
}

/**
 * The "Optimized for YouTube" toggle, ON. Writes the preset's proxy-aware
 * localization/network columns plus the stored intent flag.
 *
 * Turning it OFF only clears the flag: the underlying values stay as they
 * are. Reverting them would mean picking something to revert TO, and every
 * candidate ("real") is strictly worse for anti-detect. Advanced is where
 * individual fields get changed deliberately.
 */
export function optimizedPatch(on: boolean): FingerprintPatch {
  if (!on) return { google_optimized: false }
  return {
    google_optimized: true,
    webrtc_mode: OPTIMIZED_PRESET.webrtc_mode,
    timezone_mode: OPTIMIZED_PRESET.timezone_mode,
    language_mode: OPTIMIZED_PRESET.language_mode,
    location_mode: OPTIMIZED_PRESET.location_mode,
    display_language_mode: OPTIMIZED_PRESET.display_language_mode,
    webgpu_mode: OPTIMIZED_PRESET.webgpu_mode
  }
}

/** Windows / macOS label for a stored platform string. */
export function osLabel(platform: string | null | undefined): 'Windows' | 'macOS' {
  return (platform ?? '').toLowerCase().includes('mac') ? 'macOS' : 'Windows'
}
