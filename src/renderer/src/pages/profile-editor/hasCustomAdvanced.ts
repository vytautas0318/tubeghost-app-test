import type { ProfileRow } from '@/lib/profiles'

/**
 * True when the profile carries advanced values that differ from what a
 * freshly-created profile gets. Drives the Simple editor's "custom settings
 * are preserved" note, so the user knows Simple isn't quietly dropping work
 * they did in Advanced.
 *
 * Mirrors the createProfile() defaults in lib/profiles.ts. NOTE: webgl /
 * cores / RAM are NO LONGER part of this check — since 2026-08-12 every new
 * profile is created with the archetype's Custom values (matching what "New
 * fingerprint" writes), so treating a non-null vendor as "the user customised
 * this" would show the note on every profile and make it meaningless.
 *
 * NOTE: random_fingerprint_on_startup is deliberately NOT a signal — it
 * defaults from the workspace Fingerprint settings (auto_rotate), so a
 * workspace with rotation enabled would flag every profile as customised.
 */
export function hasCustomAdvanced(p: ProfileRow | null): boolean {
  if (!p) return false
  return (
    // Deliberately NOT google_optimized: Simple owns that toggle and shows its
    // state directly, so it isn't a hidden "advanced" value.
    (p.fonts_mode != null && p.fonts_mode !== 'default') ||
    (p.launch_args != null && p.launch_args.trim() !== '')
  )
}
