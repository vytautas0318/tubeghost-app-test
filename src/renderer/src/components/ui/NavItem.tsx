import * as React from 'react'

/**
 * NavItem — a sidebar rail row (always-dark context), ported from the TubeGhost
 * Design System. Active gets a red soft fill + a red left marker bar. Renders an
 * icon, label, and an optional trailing count / badge / alert / live dot.
 *
 * Presentational only — the caller wires navigation via `onClick` + `active`.
 */
export interface NavItemProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  icon?: React.ReactNode
  label: React.ReactNode
  count?: React.ReactNode
  badge?: React.ReactNode
  alert?: React.ReactNode
  live?: boolean
  active?: boolean
  style?: React.CSSProperties
}

export function NavItem({
  icon = null,
  label,
  count,
  badge = null,
  alert = null,
  live = false,
  active = false,
  onClick,
  style = {},
  ...rest
}: NavItemProps): React.ReactElement {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        height: '40px',
        padding: '0 11px',
        borderRadius: 'var(--r)',
        color: active ? '#fff' : 'var(--sb-t2)',
        background: active ? 'var(--sb-active)' : 'transparent',
        fontSize: '14px',
        fontWeight: active ? 550 : 450,
        cursor: 'pointer',
        transition: 'var(--t-color)',
        position: 'relative',
        ...style
      }}
      {...rest}
    >
      {active ? (
        <span
          style={{
            position: 'absolute',
            left: '-11px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '3px',
            height: '20px',
            borderRadius: '0 3px 3px 0',
            background: 'var(--red)'
          }}
        />
      ) : null}
      {icon ? (
        <span
          style={{
            display: 'inline-flex',
            width: '18px',
            height: '18px',
            flexShrink: 0,
            color: active ? 'var(--red)' : 'inherit'
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      {badge != null ? (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '9.5px',
            fontWeight: 700,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            color: 'var(--green)',
            background: 'var(--green-soft)',
            padding: '2px 7px',
            borderRadius: '999px'
          }}
        >
          {badge}
        </span>
      ) : alert != null ? (
        <span
          title="Needs attention"
          style={{
            marginLeft: 'auto',
            fontSize: '10.5px',
            fontWeight: 700,
            color: 'var(--amber)',
            background: 'var(--amber-soft)',
            minWidth: '18px',
            height: '18px',
            padding: '0 5px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '999px'
          }}
        >
          {alert}
        </span>
      ) : live ? (
        <span
          style={{
            marginLeft: 'auto',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--green)',
            animation: 'liveDot 2.2s infinite'
          }}
        />
      ) : count != null ? (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '11.5px',
            fontWeight: 500,
            color: active ? 'var(--sb-t2)' : 'var(--sb-t3)',
            fontFamily: 'var(--mono)'
          }}
        >
          {count}
        </span>
      ) : null}
    </div>
  )
}
