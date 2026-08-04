// Custom hook that owns Proxies-page data fetching: initial load,
// realtime subscription, profile-count side queries, and basic mutations.
// Keeps the page component focused on layout/state orchestration.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  deleteProxy,
  getProxySyncHealth,
  listProfileNumbersByProxy,
  listProxies,
  syncMyProxies,
  type ProxyRow,
  type ProxySyncIssue,
  type SyncMyProxiesResult
} from '@/lib/proxies'
import { getSupabase } from '@/lib/supabase'
import type { ViewProxy } from './types'

interface UseProxiesDataResult {
  rows: ProxyRow[]
  view: ViewProxy[]
  countries: string[]
  counts: { total: number; active: number; expired: number }
  lastSync: string | null
  loading: boolean
  error: string | null
  syncIssues: ProxySyncIssue[]
  removeRow: (id: string) => Promise<void>
  insertLocal: (row: ProxyRow) => void
  refresh: () => Promise<void>
  // Pull the user's purchased proxies from TubeProxies, re-fetch rows, then
  // check the server-side retry queue. Returns the pull outcome plus any
  // still-stuck syncs so the UI can report a real, specific result.
  syncNow: () => Promise<{ pull: SyncMyProxiesResult | null; issues: ProxySyncIssue[] }>
}

export function useProxiesData(workspaceId: string | null, enabled: boolean): UseProxiesDataResult {
  const [rows, setRows] = useState<ProxyRow[]>([])
  const [profileNumbers, setProfileNumbers] = useState<Record<string, number[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncIssues, setSyncIssues] = useState<ProxySyncIssue[]>([])

  // Initial load
  useEffect(() => {
    if (!workspaceId || !enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    listProxies(workspaceId)
      .then(async (data) => {
        if (cancelled) return
        setRows(data)
        setError(null)
        // One workspace-wide query is cheaper than one-per-proxy.
        try {
          // Pass the rows so legacy assignments (proxy_host/port with no
          // proxy_id) are attributed to their proxy too.
          const map = await listProfileNumbersByProxy(workspaceId, data)
          if (!cancelled) setProfileNumbers(map)
        } catch {
          if (!cancelled) setProfileNumbers({})
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [workspaceId, enabled])

  // Realtime subscription
  useEffect(() => {
    if (!workspaceId || !enabled) return
    const supabase = getSupabase()
    if (!supabase) return
    const channel = supabase
      .channel(`proxies:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'ghost',
          table: 'proxies',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === 'INSERT') {
              const next = payload.new as ProxyRow
              // Guard against the row already being present — insertLocal()
              // (add-proxy panel) and refresh()/sync both put it in the list
              // before this event lands, which would otherwise render it twice.
              if (prev.some((p) => p.id === next.id)) return prev
              return [next, ...prev]
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((p) => p.id !== (payload.old as ProxyRow).id)
            }
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as ProxyRow
              return prev.map((p) => (p.id === next.id ? next : p))
            }
            return prev
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, enabled])

  // host:port → set of distinct sources present, so we can flag the same
  // endpoint appearing as BOTH a synced (tubeproxies) and a custom row.
  const sourcesByEndpoint = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const r of rows) {
      const key = `${r.host.toLowerCase()}:${r.port}`
      const set = m.get(key) ?? new Set<string>()
      set.add(r.source)
      m.set(key, set)
    }
    return m
  }, [rows])

  const view: ViewProxy[] = useMemo(
    () =>
      rows.map((r) => {
        const numbers = profileNumbers[r.id] ?? []
        const sources = sourcesByEndpoint.get(`${r.host.toLowerCase()}:${r.port}`)
        return {
          ...r,
          profileCount: numbers.length,
          profileNumbers: numbers,
          duplicateOfOtherSource: (sources?.size ?? 0) > 1,
          expiresRelative: r.expires_at
            ? formatDistanceToNow(new Date(r.expires_at), { addSuffix: true })
            : null,
          lastSyncedRelative: r.last_synced_at
            ? formatDistanceToNow(new Date(r.last_synced_at), { addSuffix: true })
            : null
        }
      }),
    [rows, profileNumbers, sourcesByEndpoint]
  )

  const countries = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => {
      if (r.country_code) set.add(r.country_code.toUpperCase())
    })
    return Array.from(set).sort()
  }, [rows])

  const counts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      expired: rows.filter((r) => r.status === 'expired').length
    }),
    [rows]
  )

  const lastSync = useMemo(() => {
    const latest = rows
      .map((r) => (r.last_synced_at ? new Date(r.last_synced_at).getTime() : 0))
      .reduce((a, b) => Math.max(a, b), 0)
    return latest > 0 ? formatDistanceToNow(new Date(latest), { addSuffix: true }) : null
  }, [rows])

  const removeRow = async (id: string): Promise<void> => {
    await deleteProxy(id)
    setRows((prev) => prev.filter((p) => p.id !== id))
  }

  // Manual re-fetch (TubeProxies tab "Refresh"/"Sync now"). Re-pulls the
  // workspace proxies + profile-number map; realtime keeps them fresh
  // otherwise, so this is a user-triggered convenience, not the primary path.
  const refresh = useCallback(async (): Promise<void> => {
    if (!workspaceId || !enabled) return
    const data = await listProxies(workspaceId)
    setRows(data)
    try {
      setProfileNumbers(await listProfileNumbersByProxy(workspaceId, data))
    } catch {
      /* keep prior map */
    }
  }, [workspaceId, enabled])

  const insertLocal = (row: ProxyRow): void => {
    // Same guard as the realtime handler — whichever path arrives second is
    // a no-op instead of a duplicate row.
    setRows((prev) => (prev.some((p) => p.id === row.id) ? prev : [row, ...prev]))
    setProfileNumbers((prev) => ({ ...prev, [row.id]: [] }))
  }

  // "Sync now": PULL the user's purchased proxies from TubeProxies (on-demand
  // edge function), then refresh the table and check the retry queue. Returns
  // both the pull outcome and any still-stuck syncs so the UI can report a
  // specific result instead of silently claiming success. A pull failure is
  // non-fatal here (still refresh + report) — the caller inspects `pull`.
  const syncNow = useCallback(async (): Promise<{
    pull: SyncMyProxiesResult | null
    issues: ProxySyncIssue[]
  }> => {
    let pull: SyncMyProxiesResult | null = null
    let pullError: Error | null = null
    try {
      if (workspaceId) pull = await syncMyProxies(workspaceId)
    } catch (e) {
      pullError = e as Error
    }
    await refresh()
    const issues = await getProxySyncHealth()
    setSyncIssues(issues)
    if (pullError) throw pullError
    return { pull, issues }
  }, [refresh, workspaceId])

  return {
    rows,
    view,
    countries,
    counts,
    lastSync,
    loading,
    error,
    syncIssues,
    removeRow,
    insertLocal,
    refresh,
    syncNow
  }
}
