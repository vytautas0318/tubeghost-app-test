// Proxies-table sort direction, persisted to localStorage so it survives a
// refresh (matches the pre-existing tpb.proxies.sortDir behaviour).

import { useEffect, useState } from 'react'

const KEY = 'tpb.proxies.sortDir'

export function useProxySort(): { sortDir: 'asc' | 'desc'; toggle: () => void } {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    try {
      return localStorage.getItem(KEY) === 'desc' ? 'desc' : 'asc'
    } catch {
      return 'asc'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(KEY, sortDir)
    } catch {
      /* ignore */
    }
  }, [sortDir])
  return { sortDir, toggle: () => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')) }
}
