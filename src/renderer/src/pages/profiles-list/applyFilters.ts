// Pure filter + sort pipeline for the Profiles list. Lifted out of
// ProfilesList.tsx to keep the page component under the size cap.
//
// `now` is passed in by the caller so the call site stays in control
// of cache invalidation (the page passes Date.now() inside its
// useMemo, which the React purity rule otherwise complains about).

import type { ProfileRow } from '@/lib/profiles'
import type { ViewProfile } from './types'
import type { FilterState } from './filterTypes'
import type { GroupFilter } from './GroupSidebar'
import type { SortState } from './SortHeader'

const DAY_MS = 24 * 60 * 60 * 1000

export function applyFiltersAndSort(args: {
  view: ViewProfile[]
  rows: ProfileRow[]
  groupName: Map<string, string>
  groupFilter: GroupFilter
  filters: FilterState
  sort: SortState
  now: number
}): ViewProfile[] {
  const { view, rows, groupName, groupFilter, filters, sort, now } = args
  const rowById = new Map<string, ProfileRow>()
  for (const r of rows) rowById.set(r.id, r)

  let out = view

  // Group sidebar filter
  if (groupFilter === 'ungrouped') {
    out = out.filter((p) => {
      const raw = rowById.get(p.id)
      return raw != null && !raw.group_id
    })
  } else if (groupFilter !== 'all') {
    out = out.filter((p) => rowById.get(p.id)?.group_id === groupFilter)
  }

  // Status chip
  if (filters.status !== 'all') {
    out = out.filter((p) => {
      if (filters.status === 'open') return p.status === 'open' && !p.openByOther
      if (filters.status === 'in_use_elsewhere') return !!p.openByOther
      if (filters.status === 'idle') return p.status === 'idle'
      return true
    })
  }

  // Tag chip (AND across selected tags)
  if (filters.tags.length > 0) {
    out = out.filter((p) => filters.tags.every((t) => p.tags.includes(t)))
  }

  // Proxy chip
  if (filters.proxy !== 'any') {
    out = out.filter((p) => {
      const has = !!p.proxyIp
      return filters.proxy === 'has' ? has : !has
    })
  }

  // Last-opened chip
  if (filters.lastOpened !== 'any') {
    out = out.filter((p) => {
      const raw = rowById.get(p.id)
      const ts = raw?.last_opened_at ? new Date(raw.last_opened_at).getTime() : null
      if (filters.lastOpened === 'never') return ts === null
      if (ts === null) return false
      if (filters.lastOpened === 'today') return now - ts < DAY_MS
      if (filters.lastOpened === 'week') return now - ts < 7 * DAY_MS
      return true
    })
  }

  // Free-text search (name, tag, proxy IP, group name)
  if (filters.search.trim()) {
    const q = filters.search.toLowerCase()
    out = out.filter((p) => {
      const raw = rowById.get(p.id)
      const gname = raw?.group_id ? groupName.get(raw.group_id) ?? '' : ''
      return (
        p.name.toLowerCase().includes(q) ||
        p.proxyIp.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)) ||
        gname.toLowerCase().includes(q)
      )
    })
  }

  // Sort. Nulls always sink to the bottom regardless of direction —
  // a profile with no opened-at or no number shouldn't bubble to the
  // top just because the sort flipped.
  const sign = sort.dir === 'asc' ? 1 : -1
  const sorted = [...out].sort((a, b) => {
    if (sort.key === 'number') {
      if (a.number == null && b.number == null) return 0
      if (a.number == null) return 1
      if (b.number == null) return -1
      return (a.number - b.number) * sign
    }
    if (sort.key === 'name') {
      return a.name.localeCompare(b.name) * sign
    }
    const ra = rowById.get(a.id)
    const rb = rowById.get(b.id)
    const ta = ra?.last_opened_at ? new Date(ra.last_opened_at).getTime() : null
    const tb = rb?.last_opened_at ? new Date(rb.last_opened_at).getTime() : null
    if (ta == null && tb == null) return 0
    if (ta == null) return 1
    if (tb == null) return -1
    return (ta - tb) * sign
  })
  return sorted
}
