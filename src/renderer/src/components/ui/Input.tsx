import * as React from 'react'

/**
 * Input — 40px text field, panel-2 fill, red focus ring (ported from the
 * TubeGhost Design System). Optional leading icon.
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'style'> {
  icon?: React.ReactNode
  style?: React.CSSProperties
  wrapStyle?: React.CSSProperties
}

export function Input({ icon = null, style = {}, wrapStyle = {}, ...rest }: InputProps): React.ReactElement {
  if (icon) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          height: '40px',
          padding: '0 13px',
          borderRadius: 'var(--r)',
          background: 'var(--panel-2)',
          border: '1px solid var(--line)',
          transition: 'var(--t-control)',
          ...wrapStyle
        }}
      >
        <span
          style={{ display: 'inline-flex', width: '15px', height: '15px', color: 'var(--t3)', flexShrink: 0 }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <input
          style={{
            border: 'none',
            outline: 'none',
            background: 'none',
            fontSize: '13.5px',
            fontFamily: 'var(--sans)',
            color: 'var(--t1)',
            width: '100%',
            ...style
          }}
          {...rest}
        />
      </div>
    )
  }
  return (
    <input
      style={{
        width: '100%',
        height: '40px',
        padding: '0 13px',
        borderRadius: 'var(--r)',
        background: 'var(--panel-2)',
        border: '1px solid var(--line)',
        color: 'var(--t1)',
        fontSize: '13.5px',
        fontFamily: 'var(--sans)',
        transition: 'var(--t-control)',
        ...style
      }}
      {...rest}
    />
  )
}
