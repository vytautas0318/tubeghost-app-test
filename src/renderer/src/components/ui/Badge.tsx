import * as React from 'react'

/**
 * Badge — small soft-tinted label used for profile tags, roles, counts
 * (ported from the TubeGhost Design System). Presentational only.
 */
export type BadgeTone = 'red' | 'amber' | 'blue' | 'violet' | 'green' | 'neutral'

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  red: { bg: 'var(--red-soft)', fg: 'var(--red)' },
  amber: { bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  blue: { bg: 'var(--blue-soft)', fg: 'var(--blue)' },
  violet: { bg: 'var(--violet-soft)', fg: 'var(--violet)' },
  green: { bg: 'var(--green-soft)', fg: 'var(--green)' },
  neutral: { bg: 'var(--hover)', fg: 'var(--t2)' }
}

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  tone?: BadgeTone
  // Optional raw hex (e.g. a user-chosen tag color). When set it overrides
  // `tone`: the chip uses the hex as its foreground and a soft tint of it as
  // the background (via color-mix), preserving the soft-chip look for any color.
  color?: string
  icon?: React.ReactNode
  style?: React.CSSProperties
}

export function Badge({
  tone = 'neutral',
  color,
  icon = null,
  children,
  style = {},
  ...rest
}: BadgeProps): React.ReactElement {
  const t = color
    ? { bg: `color-mix(in srgb, ${color} 15%, transparent)`, fg: color }
    : (TONES[tone] ?? TONES.neutral)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '11px',
        fontWeight: 550,
        padding: icon ? '2px 8px 2px 6px' : '2px 8px',
        borderRadius: '6px',
        whiteSpace: 'nowrap',
        background: t.bg,
        color: t.fg,
        ...style
      }}
      {...rest}
    >
      {icon ? (
        <span style={{ display: 'inline-flex', width: '13px', height: '13px' }} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}
