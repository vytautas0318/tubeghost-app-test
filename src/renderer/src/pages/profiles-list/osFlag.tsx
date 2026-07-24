import * as React from 'react'
import { Monitor } from 'lucide-react'

/**
 * OsMark — the small OS glyph shown under a profile name: the Windows 4-square
 * logo for Windows fingerprints, the Apple logo for macOS, else a generic
 * monitor. Inherits currentColor.
 */
export function OsMark({
  platform,
  className = 'w-3 h-3 shrink-0'
}: {
  platform?: string | null
  className?: string
}): React.ReactElement {
  const p = (platform ?? '').toLowerCase()
  if (p.includes('mac') || p.includes('apple') || p.includes('ios')) {
    // The Apple glyph only fills ~73% of its 24×24 viewBox (vs the Windows
    // squares which fill it fully), so scale it up to render the same visual
    // size. transform doesn't change the layout box, so the row is unaffected.
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        style={{ transform: 'scale(1.35)' }}
        aria-label="macOS"
      >
        <path d="M17 1.9c0 1-.4 2-1 2.7-.7.8-1.8 1.4-2.8 1.3-.1-1 .4-2 1-2.7.7-.8 1.9-1.4 2.8-1.3zM20 8.4c-1.1.7-1.8 1.9-1.8 3.3 0 1.5.9 2.9 2.2 3.5-.3.9-.7 1.7-1.2 2.5-.7 1-1.4 2-2.5 2-1.1 0-1.4-.7-2.7-.7-1.2 0-1.6.6-2.6.7-1.1 0-1.9-1.1-2.6-2.1-1.4-2-2.5-5.7-1-8.2.7-1.2 2-2 3.4-2 1 0 2 .7 2.7.7.6 0 1.8-.9 3.1-.7.5 0 2 .2 3 1.5z" />
      </svg>
    )
  }
  if (p.includes('win')) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Windows">
        <path d="M0 0h11v11H0zM13 0h11v11H13zM0 13h11v11H0zM13 13h11v11H13z" />
      </svg>
    )
  }
  return <Monitor className={className} aria-label="OS" />
}

/**
 * flagEmoji — turn a 2-letter ISO country code into its regional-indicator flag
 * emoji (e.g. "US" → 🇺🇸). Returns null for missing/invalid codes.
 */
export function flagEmoji(cc?: string | null): string | null {
  if (!cc || cc.length !== 2 || !/^[a-zA-Z]{2}$/.test(cc)) return null
  const base = 0x1f1e6
  const up = cc.toUpperCase()
  return String.fromCodePoint(base + up.charCodeAt(0) - 65, base + up.charCodeAt(1) - 65)
}
