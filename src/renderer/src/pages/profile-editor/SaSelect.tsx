// A themed dropdown for the Simple editor.
//
// Replaces the native <select>. On macOS the OS draws the popup itself — it
// ignores `color-scheme`, `option` colors and every other style we set — so a
// native control renders a dark system menu with a blue highlight over the
// light card. Every other dropdown in this editor (Group, Proxy, Authenticator,
// Phone, Tags) is already custom HTML using .sa-px-pop; this brings the
// remaining selects onto the same pattern so they all look and behave alike.

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface SaOption {
  value: string
  label: string
}

export function SaSelect({
  value,
  options,
  ariaLabel,
  disabled,
  onChange
}: {
  value: string
  options: SaOption[]
  ariaLabel: string
  disabled?: boolean
  onChange: (value: string) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find((o) => o.value === value)

  return (
    <div className="sa-px" ref={wrapRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="sa-sel sans"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current?.label ?? value}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="sa-px-pop" role="listbox" aria-label={ariaLabel}>
          <div className="sa-px-list">
            {options.map((o) => {
              const on = o.value === value
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  key={o.value}
                  className={'sa-px-opt' + (on ? ' on' : '')}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  <span className="sa-px-ip sans">{o.label}</span>
                  {on && (
                    <span className="sa-px-check">
                      <Check />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
