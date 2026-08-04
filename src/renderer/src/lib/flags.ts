// Country flag asset lookup.
//
// We used to emit regional-indicator EMOJI (🇺🇸). That silently degrades on
// Windows — Segoe UI Emoji has no country-flag glyphs, so the OS draws the two
// letters ("US") and the flag looks missing. Emoji can't be fixed with CSS; the
// glyphs don't exist. So we ship real SVGs instead (`country-flag-icons`).
//
// Kept out of the component file so importing these helpers doesn't break React
// Fast Refresh (which requires component-only modules) — same reason the old
// profile-editor/flag.ts existed.

// Eager URL glob: resolves at build time to { '…/3x2/US.svg': '/assets/US-<hash>.svg', … }.
// `query: '?url'` keeps the SVG out of the JS bundle — only the URL is inlined,
// and vite.config.ts opts these files out of asset inlining so the bundle
// carries just this map (~23 kB) instead of 260 base64 flags (~230 kB).
// '@flags' is aliased in vite.config.ts to the package's 3x2 folder; a
// root-absolute path would miss, since Vite's root is src/renderer/.
const FLAG_URLS = import.meta.glob<string>('@flags/*.svg', {
  query: '?url',
  import: 'default',
  eager: true
})

const BY_CODE: Record<string, string> = {}
for (const [path, url] of Object.entries(FLAG_URLS)) {
  const code = path.slice(path.lastIndexOf('/') + 1).replace('.svg', '').toUpperCase()
  BY_CODE[code] = url
}

// A silently-empty glob is the one way this fails invisibly (every flag falls
// back to the globe and reads as missing geo data). Shout early in dev.
if (import.meta.env.DEV && Object.keys(BY_CODE).length === 0) {
  console.error(
    '[flags] No flag SVGs matched the @flags glob — check the alias in vite.config.ts ' +
      'and that country-flag-icons is installed. Flags will fall back to the globe icon.'
  )
}

/** Asset URL for a 2-letter ISO country code, or null when unknown. */
export function flagUrl(cc?: string | null): string | null {
  if (!cc || !/^[a-zA-Z]{2}$/.test(cc.trim())) return null
  return BY_CODE[cc.trim().toUpperCase()] ?? null
}

/** True when we can render a real flag for this code — callers use it to pick
 *  their own fallback (the proxy cells show a globe). */
export function hasFlag(cc?: string | null): boolean {
  return flagUrl(cc) !== null
}
