// Search box + toolbar filters above the Profiles table. Matches the TubeGhost
// mockup: Search + Group (via `leading`) + Tag. Status/Proxy/Last-opened filter
// state still exists in FilterState (defaults are no-ops) but isn't surfaced —
// re-add chips here if those filters are wanted back.

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { FilterChip, ChipMenu } from './FilterChip'
import { ProxyFilterMenu, type ProxyOption } from './ProxyFilterMenu'
import {
  EMPTY_FILTERS,
  activeFilterCount,
  LAST_OPENED_LABELS,
  PROXY_LABELS,
  type FilterState,
  type LastOpenedFilter
} from './filterTypes'

export function Filters({
  state,
  onChange,
  proxyOptions = [],
  leading,
  trailing,
  sortControl
}: {
  state: FilterState
  onChange: (next: FilterState) => void
  // Distinct proxies in use across the workspace's profiles, for the Proxy
  // dropdown's multi-select list. Empty = only the any/has/none modes show.
  proxyOptions?: ProxyOption[]
  // Rendered right after the search box (e.g. the toolbar Group dropdown).
  leading?: React.ReactNode
  // Rendered after `leading` (e.g. the toolbar Tag dropdown).
  trailing?: React.ReactNode
  // Sort dropdown. Passed in rather than owned here because sort state lives on
  // the page (persisted, and shared with the table's column headers).
  sortControl?: React.ReactNode
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

      {/* Last opened + Proxy: both were already in FilterState and already
          honoured by applyFilters, but nothing rendered them — so the filtering
          existed with no way to reach it. */}
      <FilterChip
        label="Last opened"
        value={state.lastOpened === 'any' ? null : LAST_OPENED_LABELS[state.lastOpened]}
        placeholder={LAST_OPENED_LABELS.any}
      >
        {(close) => (
          <ChipMenu
            options={(Object.keys(LAST_OPENED_LABELS) as LastOpenedFilter[]).map((k) => ({
              value: k,
              label: LAST_OPENED_LABELS[k]
            }))}
            current={state.lastOpened}
            onPick={(v) => {
              onChange({ ...state, lastOpened: v as LastOpenedFilter })
              close()
            }}
          />
        )}
      </FilterChip>

      <FilterChip
        label="Proxy"
        value={
          state.proxyIds.length > 0
            ? state.proxyIds.length === 1
              ? (proxyOptions.find((o) => o.key === state.proxyIds[0])?.label ??
                `${state.proxyIds.length} selected`)
              : `${state.proxyIds.length} selected`
            : state.proxy === 'any'
              ? null
              : PROXY_LABELS[state.proxy]
        }
        placeholder={PROXY_LABELS.any}
      >
        {(close) => (
          <ProxyFilterMenu state={state} options={proxyOptions} onChange={onChange} close={close} />
        )}
      </FilterChip>

      {sortControl}

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
