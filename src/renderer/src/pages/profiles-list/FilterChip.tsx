// Pill-shaped filter chip with a popover. The chip is "active" (red
// outline + filled bg) when `value` is non-null. Used by Filters.tsx
// for Status / Tag / Proxy / Last-opened.

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export function FilterChip({
  label,
  value,
  children
}: {
  label: string
  // ReactNode so callers can render a flag image alongside the text.
  value: React.ReactNode | null
  children: (close: () => void) => React.ReactNode
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className={'fdrop-btn' + (value ? ' active' : '')}>
        <span className="fl">{label}</span>
        <span className="fv">{value ?? 'All'}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 min-w-[160px] bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r)] shadow-[var(--shadow-pop)]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function ChipMenu({
  options,
  current,
  onPick
}: {
  options: Array<{ value: string; label: React.ReactNode }>
  current: string
  onPick: (v: string) => void
}): React.ReactElement {
  return (
    <div className="py-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onPick(o.value)}
          className={
            'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ' +
            (o.value === current
              ? 'bg-[var(--red-soft)] text-[var(--red)] font-semibold'
              : 'text-[var(--t1)] hover:bg-[var(--hover)]')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
