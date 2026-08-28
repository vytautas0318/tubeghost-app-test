// Quantity steppers for the upgrade configurator, ported from the marketing
// pricing page (PricingTable.tsx). Breakpoint tables come from the shared
// pricing module so the hop points can never drift from the discount bands.
//
// All three strip non-digits on change and clamp on blur, so an empty or
// garbage field can never NaN the total.

import * as React from 'react'
import { Minus, Plus } from 'lucide-react'
import { PF_MAX, PF_STOPS } from '@shared/pricing'

function parse(v: string): number | null {
  const n = parseInt(v.replace(/\D/g, ''), 10)
  return isNaN(n) ? null : n
}

interface ShellProps {
  value: number
  label: string
  onDec: () => void
  onInc: () => void
  onType: (n: number) => void
  onCommit: (n: number | null) => void
  decDisabled?: boolean
  incDisabled?: boolean
}

/** Shared −/input/+ shell: one keyboard-accessible control for all steppers. */
function Stepper({
  value,
  label,
  onDec,
  onInc,
  onType,
  onCommit,
  decDisabled,
  incDisabled
}: ShellProps): React.ReactElement {
  return (
    <div className="bill-step">
      <button type="button" onClick={onDec} disabled={decDisabled} aria-label={`Decrease ${label}`}>
        <Minus size={13} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = parse(e.target.value)
          onType(n ?? 0)
        }}
        onBlur={(e) => onCommit(parse(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onInc()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            onDec()
          }
        }}
      />
      <button type="button" onClick={onInc} disabled={incDisabled} aria-label={`Increase ${label}`}>
        <Plus size={13} />
      </button>
    </div>
  )
}

/** Profiles: hops the PF_STOPS breakpoints, accepts any typed value, clamps to [min, PF_MAX]. */
export function ProfileStepper({
  value,
  onChange,
  min = 25
}: {
  value: number
  onChange: (n: number) => void
  min?: number
}): React.ReactElement {
  const stops = PF_STOPS.filter((s) => s >= min)
  return (
    <Stepper
      value={value}
      label="Profiles"
      decDisabled={value <= min}
      incDisabled={value >= PF_MAX}
      onDec={() => {
        const below = stops.filter((s) => s < value)
        onChange(below.length ? below[below.length - 1] : min)
      }}
      onInc={() => {
        const above = stops.filter((s) => s > value)
        onChange(above.length ? above[0] : Math.min(PF_MAX, value))
      }}
      onType={(n) => onChange(Math.min(PF_MAX, n))}
      onCommit={(n) => onChange(n == null || n < min ? min : Math.min(PF_MAX, n))}
    />
  )
}

/** Proxies: hops the volume-discount breakpoints. */
/** Team members: plain ±1. */
export function CountStepper({
  value,
  onChange,
  label,
  min = 0
}: {
  value: number
  onChange: (n: number) => void
  label: string
  min?: number
}): React.ReactElement {
  return (
    <Stepper
      value={value}
      label={label}
      decDisabled={value <= min}
      onDec={() => onChange(Math.max(min, value - 1))}
      onInc={() => onChange(value + 1)}
      onType={(n) => onChange(n)}
      onCommit={(n) => onChange(n == null || n < min ? min : n)}
    />
  )
}
