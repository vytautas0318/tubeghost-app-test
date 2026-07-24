import * as React from 'react'

/**
 * Select — native select wrapped with a custom chevron, 40px tall (ported from
 * the TubeGhost Design System).
 */
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'style'> {
  style?: React.CSSProperties
}

export function Select({ children, style = {}, ...rest }: SelectProps): React.ReactElement {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          height: '40px',
          minWidth: '200px',
          padding: '0 36px 0 13px',
          borderRadius: 'var(--r)',
          background: 'var(--panel-2)',
          border: '1px solid var(--line)',
          color: 'var(--t1)',
          fontSize: '13.5px',
          fontFamily: 'var(--sans)',
          cursor: 'pointer',
          width: '100%',
          ...style
        }}
        {...rest}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '15px',
          height: '15px',
          color: 'var(--t3)',
          pointerEvents: 'none'
        }}
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  )
}
