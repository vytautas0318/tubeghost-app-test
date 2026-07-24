import * as React from 'react'

/**
 * SegmentedControl — small pill group for theme switches, view toggles, tabs
 * (ported from the TubeGhost Design System). Controlled or uncontrolled.
 */
export interface SegmentOption<T extends string = string> {
  value: T
  label?: React.ReactNode
  icon?: React.ReactNode
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[]
  value?: T
  defaultValue?: T
  onChange?: (value: T) => void
  style?: React.CSSProperties
}

export function SegmentedControl<T extends string = string>({
  options = [],
  value,
  defaultValue,
  onChange,
  style = {}
}: SegmentedControlProps<T>): React.ReactElement {
  const isControlled = value !== undefined
  const [internal, setInternal] = React.useState<T | undefined>(
    defaultValue ?? options[0]?.value
  )
  const active = isControlled ? value : internal

  const select = (v: T): void => {
    if (!isControlled) setInternal(v)
    onChange?.(v)
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        gap: '3px',
        padding: '3px',
        background: 'var(--panel-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        ...style
      }}
    >
      {options.map((o) => {
        const on = o.value === active
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => select(o.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 14px',
              borderRadius: '7px',
              border: 'none',
              background: on ? 'var(--active)' : 'none',
              color: on ? 'var(--t1)' : 'var(--t2)',
              fontSize: '12.5px',
              fontWeight: 550,
              fontFamily: 'var(--sans)',
              cursor: 'pointer',
              transition: 'var(--t-color)',
              boxShadow: on ? 'var(--shadow)' : 'none'
            }}
          >
            {o.icon ? (
              <span style={{ display: 'inline-flex', width: '14px', height: '14px' }} aria-hidden="true">
                {o.icon}
              </span>
            ) : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
