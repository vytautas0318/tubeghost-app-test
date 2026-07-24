import * as React from 'react'

/**
 * PlatformIcon — branded rounded-square glyph for a social platform, with an
 * optional OS badge in the corner (ported from the TubeGhost Design System).
 *
 * The platform/OS marks are brand logos (YouTube, TikTok, X, …), so they stay
 * as the designer's inline SVGs rather than being mapped to lucide.
 */
export type Platform = 'yt' | 'ig' | 'tt' | 'x' | 'am' | 'fb'
export type OS = 'win' | 'mac'

const GLYPHS: Record<Platform, React.ReactElement> = {
  yt: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M23 7s-.2-1.6-.8-2.3c-.8-.9-1.7-.9-2.1-1C17.1 3.4 12 3.4 12 3.4s-5.1 0-8.1.3c-.4.1-1.3.1-2.1 1C1.2 5.4 1 7 1 7S.8 8.9.8 10.7v1.6c0 1.9.2 3.7.2 3.7s.2 1.6.8 2.3c.8.9 1.9.9 2.4 1 1.7.2 7.8.3 7.8.3s5.1 0 8.1-.3c.4-.1 1.3-.1 2.1-1 .6-.7.8-2.3.8-2.3s.2-1.9.2-3.7v-1.6c0-1.9-.2-3.7-.2-3.7zM9.7 14.6V8.4l5.4 3.1-5.4 3.1z" />
    </svg>
  ),
  ig: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  ),
  tt: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.6 5.8a4.8 4.8 0 01-1-.1 4.9 4.9 0 01-3.8-2.3V15a5.6 5.6 0 11-5.6-5.6c.3 0 .6 0 .9.1v2.9a2.7 2.7 0 00-.9-.2 2.8 2.8 0 102.8 2.8V2h2.8a4.9 4.9 0 004.8 4.4V5.8z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.9 1.2h3.7l-8 9.1L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9z" />
    </svg>
  ),
  am: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M.045 18.02c.072-.116.187-.18.32-.18h22.85c.18 0 .345.06.345.275 0 .145-.09.255-.21.345-3.99 2.91-9.36 4.47-13.95 4.47-6.42 0-12.21-2.37-16.605-6.315-.12-.105-.12-.27 0-.39z" />
    </svg>
  ),
  fb: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12c0-6.6-5.4-12-12-12S0 5.4 0 12c0 6 4.4 11 10.1 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-1.9.9-1.9 1.8V12h3.3l-.5 3.5h-2.8v8.4C19.6 23 24 18 24 12z" />
    </svg>
  )
}

const BG: Record<Platform, React.CSSProperties> = {
  yt: { background: '#FF0000' },
  ig: { background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)' },
  tt: { background: '#18181B' },
  x: { background: '#18181B' },
  am: { background: '#FF9900' },
  fb: { background: '#1877F2' }
}

const OS_GLYPH: Record<OS, React.ReactElement> = {
  win: (
    <svg viewBox="0 0 24 24" fill="#007BCE">
      <path d="M0 0h11v11H0zM13 0h11v11H13zM0 13h11v11H0zM13 13h11v11H13z" />
    </svg>
  ),
  mac: (
    // The Apple glyph fills only ~73% of its viewBox, so scale it up to fill
    // the badge the same way the Windows squares do.
    <svg viewBox="0 0 24 24" fill="#007BCE" style={{ transform: 'scale(1.35)' }}>
      <path d="M17 1.9c0 1-.4 2-1 2.7-.7.8-1.8 1.4-2.8 1.3-.1-1 .4-2 1-2.7.7-.8 1.9-1.4 2.8-1.3zM20 8.4c-1.1.7-1.8 1.9-1.8 3.3 0 1.5.9 2.9 2.2 3.5-.3.9-.7 1.7-1.2 2.5-.7 1-1.4 2-2.5 2-1.1 0-1.4-.7-2.7-.7-1.2 0-1.6.6-2.6.7-1.1 0-1.9-1.1-2.6-2.1-1.4-2-2.5-5.7-1-8.2.7-1.2 2-2 3.4-2 1 0 2 .7 2.7.7.6 0 1.8-.9 3.1-.7.5 0 2 .2 3 1.5z" />
    </svg>
  )
}

export interface PlatformIconProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  platform?: Platform
  os?: OS
  size?: number
  style?: React.CSSProperties
}

export function PlatformIcon({
  platform = 'yt',
  os,
  size = 34,
  style = {},
  ...rest
}: PlatformIconProps): React.ReactElement {
  const radius = Math.round(size * 0.26)
  const glyphDim = Math.round(size * 0.52)
  return (
    <span style={{ position: 'relative', display: 'inline-grid', flexShrink: 0 }} {...rest}>
      <span
        style={{
          width: size + 'px',
          height: size + 'px',
          borderRadius: radius + 'px',
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          ...(BG[platform] ?? BG.yt),
          ...style
        }}
      >
        <span
          style={{ display: 'inline-flex', width: glyphDim + 'px', height: glyphDim + 'px' }}
          aria-hidden="true"
        >
          {GLYPHS[platform] ?? GLYPHS.yt}
        </span>
      </span>
      {os ? (
        <span
          style={{
            position: 'absolute',
            bottom: '-3px',
            right: '-3px',
            width: '15px',
            height: '15px',
            borderRadius: '5px',
            background: 'var(--panel)',
            border: '1.5px solid var(--panel)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 0 0 1px var(--line)'
          }}
        >
          <span style={{ display: 'inline-flex', width: '11px', height: '11px' }} aria-hidden="true">
            {OS_GLYPH[os] ?? OS_GLYPH.win}
          </span>
        </span>
      ) : null}
    </span>
  )
}
