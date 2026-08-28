// Splits the workspace's proxies by source (one query, split in memory — so
// switching tabs never refetches), then applies the active tab's search and
// the workspace-ordinal sort.

import { useMemo } from 'react'
import type { ViewProxy } from './types'
import type { ProxyTab } from './proxy-tab'

export function useProxyRows(
  view: ViewProxy[],
  tab: ProxyTab,
  search: string,
  sortDir: 'asc' | 'desc'
): {
  bySource: { tubeproxies: ViewProxy[]; custom: ViewProxy[] }
  tabRows: ViewProxy[]
  filtered: ViewProxy[]
} {
  const bySource = useMemo(
    () => ({
      tubeproxies: view.filter((p) => p.source === 'tubeproxies'),
      custom: view.filter((p) => p.source !== 'tubeproxies')
    }),
    [view]
  )

  const tabRows = tab === 'tubeproxies' ? bySource.tubeproxies : bySource.custom

  // Sort by workspace ordinal; TubeProxies tab also filters by IP or tag(label).
  const filtered = useMemo(() => {
    const sign = sortDir === 'asc' ? 1 : -1
    const needle = search.trim().toLowerCase()
    const rows =
      tab === 'tubeproxies' && needle
        ? tabRows.filter(
            (p) =>
              p.host.toLowerCase().includes(needle) ||
              (p.label?.toLowerCase().includes(needle) ?? false)
          )
        : tabRows
    return [...rows].sort((a, b) => {
      if (a.proxy_number == null && b.proxy_number == null) return 0
      if (a.proxy_number == null) return 1
      if (b.proxy_number == null) return -1
      return (a.proxy_number - b.proxy_number) * sign
    })
  }, [tabRows, sortDir, search, tab])

  return { bySource, tabRows, filtered }
}
