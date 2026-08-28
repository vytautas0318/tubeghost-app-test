// Toolbar "Sort" dropdown for the Profiles page.
//
// The sort model (number / last opened / name + direction) already existed and
// already persisted, but the only way to change it was clicking a TABLE column
// header — so in Simple card view there was no way to sort at all. This exposes
// the same state as a toolbar control, which both views can use.
//
// Direction is folded into the options rather than shown as a separate toggle:
// "Recently opened" is what a user asks for, not "last_opened, descending".

import * as React from 'react'
import { FilterChip, ChipMenu } from './FilterChip'
import type { SortKey, SortDir, SortState } from './SortHeader'

interface SortOption {
  value: string
  label: string
  key: SortKey
  dir: SortDir
}

const OPTIONS: SortOption[] = [
  { value: 'number:asc', label: 'Number (low to high)', key: 'number', dir: 'asc' },
  { value: 'number:desc', label: 'Number (high to low)', key: 'number', dir: 'desc' },
  { value: 'last_opened:desc', label: 'Recently opened', key: 'last_opened', dir: 'desc' },
  { value: 'last_opened:asc', label: 'Least recently opened', key: 'last_opened', dir: 'asc' },
  { value: 'name:asc', label: 'Name (A–Z)', key: 'name', dir: 'asc' },
  { value: 'name:desc', label: 'Name (Z–A)', key: 'name', dir: 'desc' }
]

// Shown on the chip. 'Number (low to high)' is the default, so it reads as the
// neutral "no explicit sort" state rather than an active filter.
const DEFAULT_VALUE = 'number:asc'

export function SortFilter({
  sort,
  onChange
}: {
  sort: SortState
  onChange: (next: SortState) => void
}): React.ReactElement {
  const value = `${sort.key}:${sort.dir}`
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]

  return (
    <FilterChip
      label="Sort"
      // null keeps the chip in its inactive style while on the default sort,
      // but the placeholder still names it — a Sort chip reading "All" would
      // say nothing about how the list is ordered.
      value={value === DEFAULT_VALUE ? null : current.label}
      placeholder={OPTIONS[0].label}
    >
      {(close) => (
        <ChipMenu
          options={OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          current={value}
          onPick={(v) => {
            const picked = OPTIONS.find((o) => o.value === v)
            if (picked) onChange({ key: picked.key, dir: picked.dir })
            close()
          }}
        />
      )}
    </FilterChip>
  )
}
