// Country flag image. See lib/flags.ts for where the SVGs come from and why
// this isn't emoji (short version: Windows has no flag glyphs).

import * as React from 'react'
import { useState } from 'react'
import { flagUrl } from '@/lib/flags'

/**
 * Flag — 3:2 country flag for a 2-letter ISO code. Renders nothing when the
 * code is missing or unknown, so callers can supply their own fallback (the
 * proxy cells show a globe). A load failure degrades to a letter chip rather
 * than a broken-image icon.
 */
export function Flag({
  code,
  // Width in px. Height follows the 3:2 ratio; the box is reserved up front so
  // rows don't reflow as flags load.
  size = 15,
  className,
  title
}: {
  code?: string | null
  size?: number
  className?: string
  title?: string
}): React.ReactElement | null {
  const [failed, setFailed] = useState(false)
  const url = flagUrl(code)
  if (!url) return null

  const cc = (code ?? '').toUpperCase()
  const height = Math.round((size / 3) * 2)

  if (failed) {
    return (
      <span
        className={className}
        title={title ?? cc}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: size,
          height,
          padding: '0 2px',
          borderRadius: 2,
          background: 'var(--hover)',
          color: 'var(--t3)',
          fontFamily: 'var(--sans)',
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: '0.02em'
        }}
      >
        {cc}
      </span>
    )
  }

  return (
    <img
      src={url}
      alt={cc}
      title={title ?? cc}
      width={size}
      height={height}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height,
        borderRadius: 2,
        objectFit: 'cover',
        // Keeps pale flags (JP, PL) from disappearing into a light panel.
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.14)',
        flexShrink: 0
      }}
    />
  )
}
