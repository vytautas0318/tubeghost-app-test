// Tiny segmented-control + toggle primitives shared across the
// fingerprint + advanced editors.

import * as React from 'react'

export function Seg<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: readonly { value: T; label: string; tip?: string }[]
  onChange: (v: T) => void
}): React.ReactElement {
  // Floating tip — only renders while the user is hovering an option.
  // Anchored above the hovered button so they don't have to read a
  // tooltip that's overlapping their cursor.
  const [hovered, setHovered] = React.useState<T | null>(null)
  const [hoverEl, setHoverEl] = React.useState<HTMLButtonElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  const tipText = hovered ? options.find((o) => o.value === hovered)?.tip : undefined

  // Compute hovered button's center relative to the container so the
  // tip sits directly above it.
  const left = (() => {
    if (!hoverEl || !containerRef.current) return null
    const a = hoverEl.getBoundingClientRect()
    const c = containerRef.current.getBoundingClientRect()
    return a.left + a.width / 2 - c.left
  })()

  return (
    <div ref={containerRef} className="relative inline-block">
      {tipText && left != null && (
        <div
          className="absolute bottom-full mb-1.5 -translate-x-1/2 z-30 pointer-events-none"
          style={{ left }}
        >
          <div className="relative bg-brand-dark dark:bg-night-raised text-white dark:text-night-text text-[10px] leading-tight px-2 py-1 rounded shadow-lg max-w-[260px] w-max">
            {tipText}
            <span className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-brand-dark dark:border-t-night-raised" />
          </div>
        </div>
      )}
      <div className="inline-flex rounded-lg border border-[var(--line)] bg-white dark:bg-night-base p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            onMouseEnter={(e) => {
              setHovered(o.value)
              setHoverEl(e.currentTarget)
            }}
            onMouseLeave={() => {
              setHovered(null)
              setHoverEl(null)
            }}
            className={
              value === o.value
                ? 'px-2.5 py-1 text-[11px] font-semibold rounded-md bg-[var(--red)] text-white'
                : 'px-2.5 py-1 text-[11px] font-semibold rounded-md text-[var(--t3)] hover:text-[var(--t1)] dark:hover:text-night-text'
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Toggle({
  on,
  onChange,
  label
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
}): React.ReactElement {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-[var(--t1)] cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${
          on ? 'bg-[var(--red)]' : 'bg-[var(--hover)]'
        }`}
        aria-pressed={on}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
            on ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </button>
      {label}
    </label>
  )
}

export function Row({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1.5">
      <div className="text-xs font-medium text-[var(--t2)] pt-1">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
