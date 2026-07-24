import * as React from 'react'

/**
 * Checkbox — 17px square, red fill + white check when on (ported from the
 * TubeGhost Design System). Controlled or uncontrolled. Presentational only.
 */
export interface CheckboxProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'style'> {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (next: boolean) => void
  style?: React.CSSProperties
}

export function Checkbox({
  checked,
  defaultChecked = false,
  onChange,
  style = {},
  ...rest
}: CheckboxProps): React.ReactElement {
  const isControlled = checked !== undefined
  const [internal, setInternal] = React.useState(defaultChecked)
  const on = isControlled ? checked : internal

  const toggle = (): void => {
    const next = !on
    if (!isControlled) setInternal(next)
    onChange?.(next)
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={toggle}
      style={{
        width: '17px',
        height: '17px',
        borderRadius: '5px',
        border: on ? '1.5px solid var(--red)' : '1.5px solid var(--line)',
        background: on ? 'var(--red)' : 'transparent',
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        transition: 'var(--t-color)',
        flexShrink: 0,
        padding: 0,
        ...style
      }}
      {...rest}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        style={{ width: '11px', height: '11px', opacity: on ? 1 : 0 }}
        aria-hidden="true"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </button>
  )
}
