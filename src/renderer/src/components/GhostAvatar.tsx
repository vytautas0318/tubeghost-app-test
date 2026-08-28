import * as React from 'react'
import type { GhostFace, GhostGlasses, GhostHat, GhostHand } from '@tubeghost/ui'

// Composable brand-mascot avatar (color + expression + glasses + hat +
// gesture), rendered entirely as inline SVG — no image upload, no storage.
// Ported from the TubeGhost Design System `GhostAvatar.jsx`. The chosen parts
// are persisted to auth.users metadata (see lib/avatar.ts) and re-rendered
// app-wide, so a user's avatar follows them across devices. Part option lists
// live in ./ghost-avatar-parts so this file exports only the component.

const INK = '#23252D'
const Eye = (cx: number): React.ReactElement => (
  <ellipse key={cx} cx={cx} cy="47" rx="3" ry="4" fill={INK} />
)

export function GhostAvatar({
  size = 34,
  color = '#F0322E',
  face = 'neutral',
  glasses = 'round',
  hat = 'none',
  hand = 'none',
  radius,
  style = {}
}: {
  size?: number
  color?: string
  face?: GhostFace
  glasses?: GhostGlasses
  hat?: GhostHat
  hand?: GhostHand
  radius?: number
  style?: React.CSSProperties
}): React.ReactElement {
  const r = radius != null ? radius : Math.round(size * 0.27)

  // ---- eyes / mouth ----
  let eyes: React.ReactNode = null
  let mouth: React.ReactNode = null
  if (glasses === 'none') {
    if (face === 'neutral')
      eyes = (
        <g>
          {Eye(39)}
          {Eye(61)}
        </g>
      )
    else if (face === 'happy') {
      eyes = (
        <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
          <path d="M35 48 q4 -6 8 0" />
          <path d="M57 48 q4 -6 8 0" />
        </g>
      )
      mouth = (
        <path d="M43 58 q7 7 14 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      )
    } else if (face === 'wink') {
      eyes = (
        <g>
          {Eye(39)}
          <path d="M57 47 h8" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
        </g>
      )
      mouth = (
        <path d="M44 58 q6 5 12 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      )
    } else if (face === 'surprised') {
      eyes = (
        <g>
          {Eye(39)}
          {Eye(61)}
        </g>
      )
      mouth = <ellipse cx="50" cy="60" rx="4" ry="5" fill={INK} />
    }
  } else {
    eyes = (
      <g>
        {Eye(39)}
        {Eye(61)}
      </g>
    )
    if (face === 'happy')
      mouth = (
        <path d="M44 61 q6 6 12 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      )
    else if (face === 'surprised') mouth = <ellipse cx="50" cy="62" rx="3.5" ry="4.5" fill={INK} />
  }

  // ---- glasses (the brand signature) ----
  let gl: React.ReactNode = null
  if (glasses === 'round')
    gl = (
      <g fill="none" stroke={INK} strokeWidth="3">
        <circle cx="39" cy="46" r="9.5" />
        <circle cx="61" cy="46" r="9.5" />
        <path d="M48.5 45 h3M70.5 43 l6 -2.5M29.5 43 l-6 -2.5" strokeLinecap="round" />
      </g>
    )
  else if (glasses === 'square')
    gl = (
      <g fill="none" stroke={INK} strokeWidth="3">
        <rect x="29" y="37.5" width="18" height="16" rx="3.5" />
        <rect x="53" y="37.5" width="18" height="16" rx="3.5" />
        <path d="M47 45 h6M71 42 l5.5 -2M29 42 l-5.5 -2" strokeLinecap="round" />
      </g>
    )

  // ---- hat ----
  let ht: React.ReactNode = null
  if (hat === 'cap')
    ht = (
      <g>
        <path d="M27 25 C30 9 70 9 73 25 Z" fill="#2A2D34" />
        <path d="M71 25 q15 -1 17 5 q-11 2 -17 -1 Z" fill="#2A2D34" />
        <circle cx="50" cy="12" r="2.4" fill="#3C4049" />
      </g>
    )
  else if (hat === 'beanie')
    ht = (
      <g>
        <path d="M28 26 C31 6 69 6 72 26 Z" fill={color} />
        <path d="M28 26 C31 6 69 6 72 26 Z" fill="rgba(0,0,0,0.18)" />
        <rect x="26" y="24" width="48" height="6" rx="3" fill="rgba(255,255,255,0.85)" />
        <circle cx="50" cy="7" r="4" fill="rgba(255,255,255,0.85)" />
      </g>
    )
  else if (hat === 'crown')
    ht = (
      <g>
        <path
          d="M31 26 L31 11 L40 18 L50 7 L60 18 L69 11 L69 26 Z"
          fill="#F5C24A"
          stroke="#D9A22E"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="13" r="2" fill="#E0533D" />
      </g>
    )
  else if (hat === 'party')
    ht = (
      <g>
        <path d="M50 2 L39 25 L61 25 Z" fill={color} />
        <path d="M50 2 L44 14.5 L56 14.5 Z" fill="rgba(255,255,255,0.7)" />
        <path d="M44 25 L56 25 L53 19 L47 19 Z" fill="rgba(255,255,255,0.7)" />
        <circle cx="50" cy="3" r="3" fill="#F5C24A" />
      </g>
    )

  // ---- hand / gesture: raised outside the body, joined by a thick arm ----
  let hd: React.ReactNode = null
  const handProps = {
    fill: '#fff',
    stroke: INK,
    strokeWidth: 2.4,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const
  }
  if (hand !== 'none') {
    const arm = 'M68 74 Q 81 72 90 64'
    let shape: React.ReactNode = null
    if (hand === 'thumbsup')
      shape = (
        <g {...handProps}>
          <rect x="84" y="50" width="14" height="14" rx="5.5" />
          <rect x="85.5" y="37" width="7.5" height="13" rx="3.7" />
        </g>
      )
    else if (hand === 'peace')
      shape = (
        <g {...handProps}>
          <rect x="84" y="51" width="14" height="13" rx="5" />
          <rect x="85" y="36" width="5" height="17" rx="2.5" transform="rotate(-10 87.5 44)" />
          <rect x="92" y="36" width="5" height="17" rx="2.5" transform="rotate(10 94.5 44)" />
        </g>
      )
    else if (hand === 'wave')
      shape = (
        <g {...handProps}>
          <rect x="83" y="49" width="16" height="15" rx="6" />
          <rect x="84.5" y="38" width="3.4" height="13" rx="1.7" />
          <rect x="88.4" y="36" width="3.4" height="15" rx="1.7" />
          <rect x="92.3" y="36" width="3.4" height="15" rx="1.7" />
          <rect x="96.2" y="38" width="3.4" height="13" rx="1.7" />
        </g>
      )
    else if (hand === 'fist')
      shape = (
        <g {...handProps}>
          <rect x="83" y="49" width="16" height="15" rx="6" />
          <path d="M86.5 51.5 v4 M90.5 51 v4 M94.5 51 v4 M98 52 v3.5" strokeWidth="1.5" />
        </g>
      )
    hd = (
      <g>
        <path d={arm} fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
        <path d={arm} fill="none" stroke="#fff" strokeWidth="5.4" strokeLinecap="round" />
        {shape}
      </g>
    )
  }

  return (
    <span
      style={{
        width: size + 'px',
        height: size + 'px',
        borderRadius: r + 'px',
        background: color,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        ...style
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width="78%"
        height="78%"
        // Decorative only. The gesture/hand geometry paints outside the tile
        // (overflow: visible), and that overflowing box would otherwise steal
        // pointer events from neighbours (e.g. the picker's "Done" button sitting
        // to the tile's upper-right). pointer-events: none lets clicks pass through.
        style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <path
          d="M50 15 C31 15 19 31 19 52 V79 c0 3.6 3.6 5.6 6.4 3.2 l3.6-3.1 c1.9-1.6 4.4-1.5 6.2 .2 l3.4 3.3 c1.9 1.8 4.8 1.8 6.7 0 l3.5-3.3 c1.8-1.7 4.3-1.8 6.2-.2 l3.6 3.1 c2.8 2.4 6.4 .4 6.4-3.2 V52 C81 31 69 15 50 15 Z"
          fill="#fff"
        />
        {eyes}
        {mouth}
        {gl}
        {ht}
        {hd}
      </svg>
    </span>
  )
}
