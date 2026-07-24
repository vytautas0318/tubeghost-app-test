// Search box + toolbar filters above the Profiles table. Matches the TubeGhost
// mockup: Search + Group (via `leading`) + Tag. Status/Proxy/Last-opened filter
// state still exists in FilterState (defaults are no-ops) but isn't surfaced —
// re-add chips here if those filters are wanted back.

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { EMPTY_FILTERS, activeFilterCount, type FilterState } from './filterTypes'

export function Filters({
  state,
  onChange,
  leading,
  trailing
}: {
  state: FilterState
  onChange: (next: FilterState) => void
  // Rendered right after the search box (e.g. the toolbar Group dropdown).
  leading?: React.ReactNode
  // Rendered after `leading` (e.g. the toolbar Tag dropdown).
  trailing?: React.ReactNode
}): React.ReactElement {
  const activeCount = activeFilterCount(state)

  return (
    <div className="pb-4 flex items-center gap-2 flex-wrap">
      <div className="tb-search">
        <Search />
        <input
          type="text"
          placeholder="Search profiles…"
          value={state.search}
          onChange={(e) => onChange({ ...state, search: e.target.value })}
        />
        <kbd>⌘K</kbd>
      </div>

      {leading}
      {trailing}

      {activeCount > 0 && (
        <button
          onClick={() => onChange({ ...EMPTY_FILTERS, search: state.search })}
          className="text-[11px] text-[var(--t3)] hover:text-[var(--red)] flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Clear filters ({activeCount})
        </button>
      )}
    </div>
  )
}
