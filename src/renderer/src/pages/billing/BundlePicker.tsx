import * as React from 'react'

export interface BundleOption {
  value: number
  label: string
}

/**
 * Fixed-size bundle selector.
 *
 * A dropdown rather than a stepper because proxies and phone numbers are sold
 * as discrete bundles on TubeProxies — 1/5/10/25/50/100 IPs, 1/3/7/15
 * numbers. A stepper would imply 17 proxies is buyable, and checkout would
 * then reject it.
 *
 * "None" (0) is always available so an add-on can be removed.
 */
export function BundlePicker({
  value,
  onChange,
  options,
  label
}: {
  value: number
  onChange: (n: number) => void
  options: BundleOption[]
  label: string
}): React.ReactElement {
  return (
    <select
      className="bill-up-select"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      <option value={0}>None</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
