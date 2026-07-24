import * as React from 'react'

/**
 * Toggle — 40×23 switch, white knob, red when on (ported from the TubeGhost
 * Design System). Controlled via `checked` + `onChange`, or uncontrolled.
 */
export interface ToggleProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'style'> {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (next: boolean) => void
  style?: React.CSSProperties
}

export function Toggle({
  checked,
  defaultChecked = false,
  onChange,
  style = {},
  ...rest
}: ToggleProps): React.ReactElement {
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
      role="switch"
      aria-checked={on}
      onClick={toggle}
      style={{
        width: '40px',
        height: '23px',
        borderRadius: '13px',
        background: on ? 'var(--red)' : 'var(--line)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s var(--ease)',
        border: 'none',
        flexShrink: 0,
        padding: 0,
        ...style
      }}
      {...rest}
    >
      <span
        style={{
          position: 'absolute',
          top: '2px',
          left: '2px',
          width: '19px',
          height: '19px',
          borderRadius: '50%',
          background: '#fff',
          transition: 'transform 0.22s var(--ease)',
          transform: on ? 'translateX(17px)' : 'none',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)'
        }}
      />
    </button>
  )
}
