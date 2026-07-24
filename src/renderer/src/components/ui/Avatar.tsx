import * as React from 'react'

/**
 * Avatar — gradient-filled rounded square with initials, optional presence dot
 * (ported from the TubeGhost Design System). Defaults to the brand red gradient;
 * pass `colors={[a, b]}` for a per-user pair.
 */
export type AvatarSize = 'sm' | 'md' | 'lg'
export type Presence = 'on' | 'away' | 'off'

const SIZES: Record<AvatarSize, { box: string; radius: string; font: string }> = {
  sm: { box: '30px', radius: '9px', font: '11px' },
  md: { box: '36px', radius: '10px', font: '13px' },
  lg: { box: '42px', radius: '11px', font: '14px' }
}

const PRES: Record<Presence, string> = {
  on: 'var(--green)',
  away: 'var(--amber)',
  off: 'var(--t4)'
}

export interface AvatarProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  initials?: string
  // When set, the image is shown instead of the initials/gradient tile.
  src?: string | null
  colors?: [string, string]
  size?: AvatarSize
  presence?: Presence
  style?: React.CSSProperties
}

export function Avatar({
  initials = '',
  src,
  colors,
  size = 'md',
  presence,
  style = {},
  ...rest
}: AvatarProps): React.ReactElement {
  const s = SIZES[size] ?? SIZES.md
  const grad = colors
    ? `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`
    : 'linear-gradient(135deg, var(--red), var(--red-hover))'
  return (
    <span style={{ position: 'relative', display: 'inline-grid', flexShrink: 0 }} {...rest}>
      {src ? (
        <img
          src={src}
          alt=""
          style={{
            width: s.box,
            height: s.box,
            borderRadius: s.radius,
            objectFit: 'cover',
            display: 'block',
            ...style
          }}
        />
      ) : (
        <span
          style={{
            width: s.box,
            height: s.box,
            borderRadius: s.radius,
            background: grad,
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: s.font,
            fontWeight: 700,
            ...style
          }}
        >
          {initials}
        </span>
      )}
      {presence ? (
        <span
          style={{
            position: 'absolute',
            bottom: '-2px',
            right: '-2px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: '2.5px solid var(--panel)',
            background: PRES[presence] ?? PRES.off
          }}
        />
      ) : null}
    </span>
  )
}
