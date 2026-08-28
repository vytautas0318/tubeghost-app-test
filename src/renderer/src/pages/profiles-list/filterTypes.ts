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
  // Specific proxies (host:port keys) to restrict to. Multi-select, like tags.
  // Kept SEPARATE from `proxy` above so the any/has/none modes still work: an
  // empty array means "no specific-proxy restriction", and picking proxies
  // implies "has proxy" without having to change the mode.
  proxyIds: string[]
  lastOpened: LastOpenedFilter
  // Restrict to profiles assigned to this user id. Set by the Members page
  // ("View assigned profiles"); null = no assignee restriction.
  assignedTo: string | null
}

export const EMPTY_FILTERS: FilterState = {
  search: '',
  status: 'all',
  tags: [],
  proxy: 'any',
  proxyIds: [],
  lastOpened: 'any',
  assignedTo: null
}

export function activeFilterCount(f: FilterState): number {
  let n = 0
  if (f.status !== 'all') n += 1
  if (f.tags.length > 0) n += 1
  if (f.proxy !== 'any' || f.proxyIds.length > 0) n += 1
  if (f.lastOpened !== 'any') n += 1
  if (f.assignedTo) n += 1
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
