import { describe, expect, it } from 'vitest'
import { applyFiltersAndSort } from '../applyFilters'
import { EMPTY_FILTERS, activeFilterCount, type FilterState } from '../filterTypes'
import type { ViewProfile } from '../types'
import type { ProfileRow } from '@/lib/profiles'

// Two profiles share host 1.1.1.1 on DIFFERENT ports — the case that makes
// host-only keying wrong.
const view = [
  { id: 'a', name: 'A', proxyIp: '1.1.1.1', proxyPort: 8080 },
  { id: 'b', name: 'B', proxyIp: '1.1.1.1', proxyPort: 9090 },
  { id: 'c', name: 'C', proxyIp: '2.2.2.2', proxyPort: 8080 },
  { id: 'd', name: 'D', proxyIp: '', proxyPort: null }
] as unknown as ViewProfile[]

const rows = view.map((p) => ({ id: p.id, group_id: null }) as unknown as ProfileRow)

function run(filters: FilterState): string[] {
  return applyFiltersAndSort({
    view,
    rows,
    groupName: new Map(),
    groupFilter: 'all',
    filters,
    sort: { key: 'name', dir: 'asc' } as never,
    now: Date.now()
  }).map((p) => p.id)
}

describe('proxy filter — specific proxies', () => {
  it('matches only the exact host:port', () => {
    expect(run({ ...EMPTY_FILTERS, proxyIds: ['1.1.1.1:8080'] })).toEqual(['a'])
  })

  it('does not confuse two proxies sharing a host', () => {
    expect(run({ ...EMPTY_FILTERS, proxyIds: ['1.1.1.1:9090'] })).toEqual(['b'])
  })

  it('is multi-select (OR across the chosen proxies)', () => {
    expect(run({ ...EMPTY_FILTERS, proxyIds: ['1.1.1.1:8080', '2.2.2.2:8080'] })).toEqual(['a', 'c'])
  })

  it('never matches a profile without a proxy', () => {
    expect(run({ ...EMPTY_FILTERS, proxyIds: ['1.1.1.1:8080'] })).not.toContain('d')
  })

  it('returns nothing for a proxy no profile uses', () => {
    expect(run({ ...EMPTY_FILTERS, proxyIds: ['9.9.9.9:1'] })).toEqual([])
  })

  // Picking a proxy already implies "has a proxy", so proxyIds must win rather
  // than intersecting with a stale mode and returning an empty list.
  it('takes priority over the any/has/none mode', () => {
    expect(run({ ...EMPTY_FILTERS, proxy: 'none', proxyIds: ['1.1.1.1:8080'] })).toEqual(['a'])
  })

  it('falls back to the mode when no proxy is picked', () => {
    expect(run({ ...EMPTY_FILTERS, proxy: 'none' })).toEqual(['d'])
    expect(run({ ...EMPTY_FILTERS, proxy: 'has' })).toEqual(['a', 'b', 'c'])
  })
})

describe('activeFilterCount', () => {
  it('counts a specific-proxy selection', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, proxyIds: ['1.1.1.1:8080'] })).toBe(1)
  })

  it('does not double-count mode plus proxies', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, proxy: 'has', proxyIds: ['1.1.1.1:8080'] })).toBe(1)
  })

  it('is zero for the empty filter state', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0)
  })
})
