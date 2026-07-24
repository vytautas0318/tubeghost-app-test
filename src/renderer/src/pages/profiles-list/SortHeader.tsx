import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

export type SortKey = 'number' | 'last_opened' | 'name'
export type SortDir = 'asc' | 'desc'
export interface SortState {
  key: SortKey
  dir: SortDir
}

export function SortHeader({
  label,
  active,
  dir,
  onClick,
  // Show a faint up/down affordance even when this column isn't the active
  // sort (matches the "Profile ⇅" header in the design).
  showInactiveIcon = false
}: {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
  showInactiveIcon?: boolean
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={
        'inline-flex items-center gap-1 transition-colors ' +
        (active ? 'text-[var(--red)]' : 'hover:text-[var(--red)]')
      }
      title={
        active
          ? dir === 'asc'
            ? 'Ascending — click to flip'
            : 'Descending — click to flip'
          : `Sort by ${label}`
      }
    >
      {label}
      {active ? (
        dir === 'asc' ? (
          <ArrowUp className="w-3 h-3" />
        ) : (
          <ArrowDown className="w-3 h-3" />
        )
      ) : showInactiveIcon ? (
        <ChevronsUpDown className="w-3 h-3 opacity-40" />
      ) : null}
    </button>
  )
}
