import * as React from 'react'
import { Search } from 'lucide-react'
import type { SortKey, StatusFilter } from './types'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'disabled', label: 'Disabled' }
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'role', label: 'Sort: Role' },
  { value: 'name', label: 'Sort: Name' },
  { value: 'lastSeen', label: 'Sort: Last seen' },
  { value: 'joined', label: 'Sort: Joined' }
]

const selectCls =
  'px-2.5 py-1.5 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30'

// Search + status filter + sort controls for the members list.
export function MembersToolbar({
  query,
  status,
  sort,
  onQuery,
  onStatus,
  onSort
}: {
  query: string
  status: StatusFilter
  sort: SortKey
  onQuery: (v: string) => void
  onStatus: (v: StatusFilter) => void
  onSort: (v: SortKey) => void
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 9, marginBottom: 14, alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
        <Search
          size={15}
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--t3)'
          }}
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search members…"
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-lg text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
        />
      </div>
      <select
        value={status}
        onChange={(e) => onStatus(e.target.value as StatusFilter)}
        className={selectCls}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value as SortKey)}
        className={selectCls}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
