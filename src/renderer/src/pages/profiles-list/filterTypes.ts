// Shared filter types + helpers for the Profiles list page. Lives in
// its own file so Filters.tsx can keep fast-refresh on (the rule
// requires a component-only file when fast-refresh is enabled).

export type StatusFilter = 'all' | 'idle' | 'open' | 'in_use_elsewhere'
export type ProxyFilter = 'any' | 'has' | 'none'
export type LastOpenedFilter = 'any' | 'today' | 'week' | 'never'

export interface FilterState {
  search: string
  status: StatusFilter
  tags: string[]
  proxy: ProxyFilter
  lastOpened: LastOpenedFilter
}

export const EMPTY_FILTERS: FilterState = {
  search: '',
  status: 'all',
  tags: [],
  proxy: 'any',
  lastOpened: 'any'
}

export function activeFilterCount(f: FilterState): number {
  let n = 0
  if (f.status !== 'all') n += 1
  if (f.tags.length > 0) n += 1
  if (f.proxy !== 'any') n += 1
  if (f.lastOpened !== 'any') n += 1
  return n
}

export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  idle: 'Idle',
  open: 'Open',
  in_use_elsewhere: 'In use elsewhere'
}
export const PROXY_LABELS: Record<ProxyFilter, string> = {
  any: 'Any',
  has: 'Has proxy',
  none: 'No proxy'
}
export const LAST_OPENED_LABELS: Record<LastOpenedFilter, string> = {
  any: 'Any time',
  today: 'Today',
  week: 'This week',
  never: 'Never'
}
