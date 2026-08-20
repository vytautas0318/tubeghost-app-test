// Map the fingerprint Form to profile columns.
//
// Extracted from FingerprintCard so bulk create can apply the SAME shared base
// to every profile it makes — one mapping, so the editor and a batch can never
// persist a fingerprint differently.

import type { Form } from './fingerprintFields.types'

export function formToProfilePatch(
  form: Form,
  // Whether the YouTube preset is on. Passed in because it combines stored
  // intent with the live field match (see isOptimizedOn) — a mapping function
  // can't know the user's opt-in on its own.
  optimizedOn: boolean
): Record<string, unknown> {
  return {
    fingerprint_seed: form.fingerprint_seed,
    platform: form.platform,
    brand: form.brand,
    // Persist the *full* version so existing data layer assumptions
    // hold; the editor only exposes the major.
    brand_version: `${form.brand_version_major}.0.0.0`,
    platform_version: form.platform_version || null,
    user_agent: form.user_agent || null,
    // Real → persist null (launcher reports the host's real value); Custom →
    // persist the chosen value (launcher spoofs it).
    hardware_concurrency:
      form.cpu_mode === 'real' || form.hardware_concurrency === ''
        ? null
        : form.hardware_concurrency,
    device_memory:
      form.ram_mode === 'real' || form.device_memory === '' ? null : form.device_memory,
    // WebGL metadata. 'real' persists NO override (null vendor +
    // renderer) so buildFingerprintConfig omits gpu.vendor/renderer
    // and the patched engine reports the host's actual GPU. 'custom'
    // persists the chosen spoof strings.
    webgl_vendor: form.webgl_mode === 'real' ? null : form.webgl_vendor,
    webgl_renderer: form.webgl_mode === 'real' ? null : form.webgl_renderer || null,
    webgpu_mode: form.webgpu_mode,
    // Derived flag: true iff the saved form matches the preset. Stored so
    // the toggle can show the "Custom" partial hint after a later edit.
    google_optimized: optimizedOn,
    timezone_mode: form.timezone_mode,
    timezone: form.timezone,
    language_mode: form.language_mode,
    language: form.language,
    webrtc_mode: form.webrtc_mode,
    noise_canvas: form.noise_canvas,
    noise_webgl_image: form.noise_webgl_image,
    noise_audiocontext: form.noise_audiocontext,
    noise_media_device: form.noise_media_device,
    noise_clientrects: form.noise_clientrects,
    noise_speechvoices: form.noise_speechvoices,
    location_mode: form.location_mode,
    location_lat: form.location_lat === '' ? null : form.location_lat,
    location_lon: form.location_lon === '' ? null : form.location_lon,
    location_prompt: form.location_prompt,
    display_language_mode: form.display_language_mode,
    display_language: form.display_language || null,
    fonts_mode: form.fonts_mode,
    fonts_list:
      form.fonts_mode === 'custom'
        ? form.fonts_list_text
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
    device_name: form.device_name || null,
    mac_address: form.mac_address || null,
    port_scan_protection: form.port_scan_protection,
    allowed_ports: form.allowed_ports || null,
    // If user picked custom resolution, persist that as the
    // screen_resolution string so the launcher just reads one field.
    screen_resolution:
      form.resolution_mode === 'custom' && form.resolution_w && form.resolution_h
        ? `${form.resolution_w}x${form.resolution_h}`
        : form.screen_resolution || null
  }
}
