// Single source of truth for the "Google/YouTube Optimized" fingerprint
// preset. When the toggle in FingerprintCard is ON, these are the exact
// values applied. The label/tooltip below are GENERATED from this same
// config so the marketing copy can never drift from what the toggle does.
//
// Goal: a profile whose fingerprint is internally consistent with its
// proxy IP and never leaks the real device — no field left on "Real".
//
// Launch-consumption reality (see [audio/timezone geo] memory notes):
//   • WebRTC=forward, WebGL=custom, timezone=based_on_ip → fully consumed.
//   • language=based_on_ip → coarse country→language, renderer path only.
//   • location=based_on_ip → stored, but NOT yet emitted as a chromium
//     flag (flag-builder.ts has no geolocation surface — explicit TODO).
//     The value is future-proof and correct; it just isn't honored at
//     launch until the engine grows a geolocation section.

// The keys here are a subset of the editor's `Form` fields. Kept as a
// standalone shape (not importing Form) so this module has no cycle with
// the 1100-line card. FingerprintCard applies these via `update(...)`.
export interface OptimizedPresetFields {
  webrtc_mode: 'forward'
  timezone_mode: 'based_on_ip'
  language_mode: 'based_on_ip'
  location_mode: 'based_on_ip'
  display_language_mode: 'based_on_language'
  webgl_mode: 'custom'
  // WebGPU follows WebGL so the GPU surface stays coherent and off "Real".
  webgpu_mode: 'based_on_webgl'
}

export const OPTIMIZED_PRESET: OptimizedPresetFields = {
  webrtc_mode: 'forward',
  timezone_mode: 'based_on_ip',
  language_mode: 'based_on_ip',
  location_mode: 'based_on_ip',
  display_language_mode: 'based_on_language',
  webgl_mode: 'custom',
  webgpu_mode: 'based_on_webgl'
}

// Human-readable "what this field becomes" — drives the tooltip so the copy
// stays in sync with OPTIMIZED_PRESET (add a field above → add its line).
const PRESET_EXPLAIN: Record<keyof OptimizedPresetFields, string> = {
  timezone_mode: 'Timezone matched to your proxy IP',
  language_mode: 'Language matched to your proxy IP',
  location_mode: 'Geolocation matched to your proxy IP',
  display_language_mode: 'Display language follows the language setting',
  webrtc_mode: 'WebRTC forwarded so only the proxy IP leaks',
  webgl_mode: 'WebGL / GPU masked (never the real device)',
  webgpu_mode: 'WebGPU kept coherent with WebGL'
}

// The fields the toggle owns. Editing any of these breaks the "Optimized"
// promise, so the toggle must reflect that (→ partial / off).
export const OPTIMIZED_CONTROLLED_FIELDS = Object.keys(
  OPTIMIZED_PRESET
) as (keyof OptimizedPresetFields)[]

// One-line marketing/help string, generated from the config. Used as the
// toggle tooltip and doubles as the feature description.
export const OPTIMIZED_TOOLTIP =
  'Tunes this profile so its fingerprint stays consistent with the proxy IP and never leaks the real device: ' +
  Object.values(PRESET_EXPLAIN)
    .map((s) => s.charAt(0).toLowerCase() + s.slice(1))
    .join('; ') +
  '. Nothing is left on "Real".'

// Short bullet list for a richer help surface if needed.
export const OPTIMIZED_BULLETS = Object.values(PRESET_EXPLAIN)

// True when `form` currently matches every preset-controlled field. Used to
// derive the toggle's on/off state so the label never misrepresents reality:
// a manual edit to any controlled field immediately flips it off/partial.
export function matchesOptimized(
  form: Pick<Record<keyof OptimizedPresetFields, string>, keyof OptimizedPresetFields>
): boolean {
  return OPTIMIZED_CONTROLLED_FIELDS.every((k) => form[k] === OPTIMIZED_PRESET[k])
}
