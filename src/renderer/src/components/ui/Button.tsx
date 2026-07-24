import * as React from 'react'

/**
 * Button — the primary action control (ported from TubeGhost Design System).
 * Variants: primary (red), secondary (default panel), ghost (transparent),
 * danger (destructive: red text, fills red on hover).
 * Sizes: md (36px), sm (32px). Optional leading/trailing icon nodes.
 *
 * Pure presentational: styling only, no app behavior. Pass a lucide icon
 * (e.g. <Plus size={15} />) via `icon` / `iconRight`.
 */
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  style?: React.CSSProperties
}

export function Button({
  variant = 'secondary',
  size = 'md',
  disabled = false,
  icon = null,
  iconRight = null,
  children,
  style = {},
  ...rest
}: ButtonProps): React.ReactElement {
  // Hover is tracked in state because the button is styled inline (inline
  // styles can't express :hover). Only the `danger` variant reacts to it.
  const [hover, setHover] = React.useState(false)
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    height: size === 'sm' ? '32px' : '36px',
    padding: size === 'sm' ? '0 11px' : '0 14px',
    borderRadius: 'var(--r)',
    fontSize: size === 'sm' ? '12.5px' : '13px',
    fontWeight: 550,
    fontFamily: 'var(--sans)',
    whiteSpace: 'nowrap',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid var(--line)',
    transition: 'var(--t-control)',
    boxShadow: 'var(--shadow)',
    background: 'var(--panel)',
    color: 'var(--t1)'
  }

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--red)',
      color: '#fff',
      borderColor: 'transparent',
      boxShadow: 'var(--shadow-red)'
    },
    secondary: {},
    ghost: {
      background: 'transparent',
      borderColor: 'transparent',
      boxShadow: 'none'
    },
    danger: {
      background: 'transparent',
      color: 'var(--red)',
      borderColor: 'transparent',
      boxShadow: 'none'
    }
  }

  // Destructive hover: fill red with white text so the consequence reads clearly.
  const hoverStyle: React.CSSProperties =
    variant === 'danger' && hover && !disabled
      ? {
          background: 'var(--red)',
          color: '#fff',
          borderColor: 'transparent',
          boxShadow: 'var(--shadow-red)'
        }
      : {}

  const disabledStyle: React.CSSProperties = disabled
    ? {
        background: 'var(--hover)',
        color: 'var(--t4)',
        borderColor: 'transparent',
        boxShadow: 'none'
      }
    : {}

  const iconWrap = (node: React.ReactNode): React.ReactElement | null =>
    node ? (
      <span style={{ display: 'inline-flex', width: '15px', height: '15px' }} aria-hidden="true">
        {node}
      </span>
    ) : null

  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...hoverStyle, ...disabledStyle, ...style }}
      {...rest}
    >
      {iconWrap(icon)}
      {children}
      {iconWrap(iconRight)}
    </button>
  )
}
