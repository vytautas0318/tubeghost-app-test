// Custom hook that owns Proxies-page data fetching: initial load,
// realtime subscription, profile-count side queries, and basic mutations.
// Keeps the page component focused on layout/state orchestration.

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  deleteProxy,
  listMyProxies,
  listProfileNumbersByProxy,
  type ProxyRow
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
  removeRow: (id: string) => Promise<void>
  insertLocal: (row: ProxyRow) => void
}

export function useProxiesData(workspaceId: string | null, enabled: boolean): UseProxiesDataResult {
  const [rows, setRows] = useState<ProxyRow[]>([])
  const [profileNumbers, setProfileNumbers] = useState<Record<string, number[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initial load
  useEffect(() => {
    if (!workspaceId || !enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    // Email-scoped: returns the user's own proxies (incl. TubeProxies purchases
    // synced under their email), independent of the active workspace. See
    // listMyProxies + RLS migration 0039.
    listMyProxies()
      .then(async (data) => {
        if (cancelled) return
        setRows(data)
        setError(null)
        // Profile-number assignments are per-workspace; only meaningful for
        // proxies in the current workspace (cross-workspace purchases have none).
        try {
          const map = await listProfileNumbersByProxy(workspaceId)
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
          schema: 'public',
          table: 'proxies',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === 'INSERT') return [payload.new as ProxyRow, ...prev]
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

  const view: ViewProxy[] = useMemo(
    () =>
      rows.map((r) => {
        const numbers = profileNumbers[r.id] ?? []
        return {
          ...r,
          profileCount: numbers.length,
          profileNumbers: numbers,
          expiresRelative: r.expires_at
            ? formatDistanceToNow(new Date(r.expires_at), { addSuffix: true })
            : null,
          lastSyncedRelative: r.last_synced_at
            ? formatDistanceToNow(new Date(r.last_synced_at), { addSuffix: true })
            : null
        }
      }),
    [rows, profileNumbers]
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

  const insertLocal = (row: ProxyRow): void => {
    setRows((prev) => [row, ...prev])
    setProfileNumbers((prev) => ({ ...prev, [row.id]: [] }))
  }

  return { rows, view, countries, counts, lastSync, loading, error, removeRow, insertLocal }
}
