// Search box + filter chips above the Proxies table. Mirrors the
// Profiles page's Filters chrome (search input on the left, rounded
// pill chips for Source / Status / Country with caret-down popovers).

import * as React from 'react'
import { Search, X } from 'lucide-react'
import type { ProxySource, ProxyStatus } from '@/lib/proxies'
import { FilterChip, ChipMenu } from '@/pages/profiles-list/FilterChip'
import { Flag } from '@/components/Flag'

const SOURCE_LABELS: Record<'all' | ProxySource, string> = {
  all: 'All',
  tubeproxies: 'TubeProxies',
  custom: 'Custom'
}
const STATUS_LABELS: Record<'all' | ProxyStatus, string> = {
  all: 'All',
  active: 'Active',
  expired: 'Expired',
  released: 'Released',
  error: 'Error'
}

export function ProxiesFilters({
  search,
  onSearch,
  sourceFilter,
  onSourceFilter,
  statusFilter,
  onStatusFilter,
  countryFilter,
  onCountryFilter,
  countries
}: {
  search: string
  onSearch: (v: string) => void
  sourceFilter: 'all' | ProxySource
  onSourceFilter: (v: 'all' | ProxySource) => void
  statusFilter: 'all' | ProxyStatus
  onStatusFilter: (v: 'all' | ProxyStatus) => void
  countryFilter: string
  onCountryFilter: (v: string) => void
  countries: string[]
}): React.ReactElement {
  const activeCount =
    (sourceFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (countryFilter !== 'all' ? 1 : 0)

  const clear = (): void => {
    onSourceFilter('all')
    onStatusFilter('all')
    onCountryFilter('all')
  }

  return (
    <div className="pb-4 flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 max-w-md min-w-[200px]">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)]" />
        <input
          type="text"
          placeholder="Search by label, IP, country…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-lg shadow-sm text-[var(--t1)] placeholder:text-[var(--t4)] dark:placeholder:text-night-muted focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
        />
      </div>

      <FilterChip
        label="Source"
        value={sourceFilter === 'all' ? null : SOURCE_LABELS[sourceFilter]}
      >
        {(close) => (
          <ChipMenu
            options={[
              { value: 'all', label: 'All sources' },
              { value: 'tubeproxies', label: 'TubeProxies' },
              { value: 'custom', label: 'Custom' }
            ]}
            current={sourceFilter}
            onPick={(v) => {
              onSourceFilter(v as 'all' | ProxySource)
              close()
            }}
          />
        )}
      </FilterChip>

      <FilterChip
        label="Status"
        value={statusFilter === 'all' ? null : STATUS_LABELS[statusFilter]}
      >
        {(close) => (
          <ChipMenu
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'active', label: 'Active' },
              { value: 'expired', label: 'Expired' },
              { value: 'released', label: 'Released' },
              { value: 'error', label: 'Error' }
            ]}
            current={statusFilter}
            onPick={(v) => {
              onStatusFilter(v as 'all' | ProxyStatus)
              close()
            }}
          />
        )}
      </FilterChip>

      {countries.length > 0 && (
        <FilterChip
          label="Country"
          value={
            countryFilter === 'all' ? null : (
              <span className="inline-flex items-center gap-1.5">
                <Flag code={countryFilter} />
                {countryFilter}
              </span>
            )
          }
        >
          {(close) => (
            <ChipMenu
              options={[
                { value: 'all', label: 'All countries' },
                ...countries.map((c) => ({
                  value: c,
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Flag code={c} />
                      {c}
                    </span>
                  )
                }))
              ]}
              current={countryFilter}
              onPick={(v) => {
                onCountryFilter(v)
                close()
              }}
            />
          )}
        </FilterChip>
      )}

      {activeCount > 0 && (
        <button
          onClick={clear}
          className="text-[11px] text-[var(--t3)] hover:text-[var(--red)] flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Clear filters ({activeCount})
        </button>
      )}
    </div>
  )
}
