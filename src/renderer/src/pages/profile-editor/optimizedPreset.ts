// Single source of truth for the "Google/YouTube Optimized" fingerprint
// preset. When the toggle in FingerprintCard is ON, these are the exact
// values applied. The label/tooltip below are GENERATED from this same
// config so the marketing copy can never drift from what the toggle does.
//
// Goal: a profile whose fingerprint is internally consistent with its
// proxy IP.
//
// DELIBERATELY EXCLUDES webgl_mode. Forcing WebGL to Custom writes a spoofed
// GPU string while the real GPU still renders canvas/WebGL pixels and reports
// the real WebGPU adapter — a string-vs-hardware contradiction that reads as
// "browser tampering" on a same-platform profile. The launcher already refuses
// to apply a same-platform Custom GPU for this reason; the preset must not ask
// for one either. Custom GPU remains a cross-platform, opt-in Advanced choice.
//
// Launch-consumption reality (see [audio/timezone geo] memory notes):
//   • WebRTC=forward, timezone=based_on_ip → fully consumed.
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
  // WebGPU follows WebGL so the GPU surface stays coherent.
  webgpu_mode: 'based_on_webgl'
}

export const OPTIMIZED_PRESET: OptimizedPresetFields = {
  webrtc_mode: 'forward',
  timezone_mode: 'based_on_ip',
  language_mode: 'based_on_ip',
  location_mode: 'based_on_ip',
  display_language_mode: 'based_on_language',
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

// True when `form` currently matches every preset-controlled field.
//
// NOTE: this is NOT sufficient on its own to drive the toggle. Since the
// preset stopped controlling webgl_mode its fields are identical to the app's
// safe defaults, so a brand-new profile matches without the user ever having
// opted in — and "off" would have no state to express, leaving the switch
// stuck on. Callers must AND this with the stored `google_optimized` flag
// (see isOptimizedOn) so turning it off is expressible and survives a save.
export function matchesOptimized(
  form: Pick<Record<keyof OptimizedPresetFields, string>, keyof OptimizedPresetFields>
): boolean {
  return OPTIMIZED_CONTROLLED_FIELDS.every((k) => form[k] === OPTIMIZED_PRESET[k])
}

/**
 * The toggle's true on/off state: the user opted in AND no controlled field
 * has since been hand-edited away from the preset.
 *
 * Two conditions because they answer different questions — the stored flag is
 * intent ("did the user ask for this?"), the field match is reality ("is it
 * still true?"). Either alone misrepresents the profile: intent alone would
 * keep claiming "optimized" after someone changed the timezone by hand, and
 * reality alone can't distinguish "opted in" from "happens to match the
 * defaults", which is what made the switch impossible to turn off.
 */
export function isOptimizedOn(
  form: Pick<Record<keyof OptimizedPresetFields, string>, keyof OptimizedPresetFields> & {
    google_optimized?: boolean | null
  }
): boolean {
  return form.google_optimized === true && matchesOptimized(form)
}
