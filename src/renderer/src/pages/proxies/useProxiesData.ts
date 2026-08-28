// Custom hook that owns Proxies-page data fetching: initial load,
// realtime subscriptions, profile-count side queries, and basic mutations.
// Keeps the page component focused on layout/state orchestration.
//
// Purchased proxies are read LIVE from TubeProxies' tables — there is no
// copy and no sync step. Custom proxies still live in ghost.proxies.
// listProxies() merges both into one ProxyRow list.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  attachMyPurchasedProxies,
  deleteProxy,
  listProfileNumbersByProxy,
  listProxies,
  type ProxyRow
} from '@/lib/proxies'
import { getSupabase } from '@/lib/supabase'
import type { ViewProxy } from './types'

interface UseProxiesDataResult {
  rows: ProxyRow[]
  view: ViewProxy[]
  countries: string[]
  counts: { total: number; active: number; expired: number }
  loading: boolean
  error: string | null
  removeRow: (id: string) => Promise<void>
  insertLocal: (row: ProxyRow) => void
  patchLocal: (id: string, patch: Partial<ProxyRow>) => void
  refresh: () => Promise<void>
}

export function useProxiesData(
  workspaceId: string | null,
  enabled: boolean,
  // proxies.create — gates contributing your own purchases to this
  // workspace's pool. Without it the page is read-only: you still see what
  // the workspace already has, you just don't add to it.
  canAttach: boolean
): UseProxiesDataResult {
  const [rows, setRows] = useState<ProxyRow[]>([])
  const [profileNumbers, setProfileNumbers] = useState<Record<string, number[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The single load path, shared by mount, Refresh, and realtime.
  //
  // `attach` matters: the live read is driven by the ATTACHMENT rows, so a
  // proxy bought since the page opened has no attachment yet and cannot
  // appear no matter how many times the list is re-read. Any user-initiated
  // load must therefore attach first — that is what makes "I just bought a
  // proxy, hit Refresh" work. Realtime passes attach:false, since it is
  // reacting to a change in rows that are already attached.
  //
  // Attaching is idempotent (ON CONFLICT DO NOTHING) and non-fatal: if it
  // fails, the list still loads.
  const load = useCallback(
    async (opts: { attach: boolean }): Promise<void> => {
      if (!workspaceId || !enabled) return
      if (opts.attach && canAttach) {
        await attachMyPurchasedProxies(workspaceId).catch(() => 0)
      }
      const data = await listProxies(workspaceId)
      setRows(data)
      setError(null)
      // One workspace-wide query is cheaper than one-per-proxy. Pass the rows
      // so purchased assignments (tubeproxies_ip_id) and legacy ones
      // (proxy_host/port with no proxy_id) are attributed to their proxy too.
      try {
        setProfileNumbers(await listProfileNumbersByProxy(workspaceId, data))
      } catch {
        /* keep the prior map rather than blanking the Profiles column */
      }
    },
    [workspaceId, enabled, canAttach]
  )

  // Initial load
  useEffect(() => {
    if (!workspaceId || !enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    load({ attach: true })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [workspaceId, enabled, load])

  // Manual re-fetch — the TubeProxies tab's "Refresh". Attaches first, so a
  // newly bought proxy appears without reloading the page.
  const refresh = useCallback((): Promise<void> => load({ attach: true }), [load])

  // Debounced re-fetch used by the purchased-side realtime subscription.
  // A public.proxies payload carries no joined inventory columns, so the row
  // can't be patched in place — re-pulling the merged list is the correct
  // response. Debounced because a bulk swap fires many events at once.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefresh = useCallback((): void => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      // attach:false — this fires on every status change upstream, and the
      // rows involved are already attached. Attaching here would add a write
      // per event for no gain.
      void load({ attach: false })
    }, 400)
  }, [load])

  // Realtime — custom proxies. ghost.proxies events patch rows in place.
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

  // Realtime — purchased proxies. These live in public.proxies, which
  // TubeProxies owns: when expire-overdue-proxies or an admin swap flips a
  // row there, re-fetch so the change renders without a manual refresh.
  // This is what makes expiry propagate instantly instead of never.
  //
  // Requires public.proxies in the supabase_realtime publication (see the
  // 20260804a migration) plus a SELECT policy for the subscriber. If either
  // is absent the subscription is simply silent and Refresh still works.
  useEffect(() => {
    if (!workspaceId || !enabled) return
    const supabase = getSupabase()
    if (!supabase) return
    let disposed = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    void supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid || disposed) return
      channel = supabase
        .channel(`purchased-proxies:${uid}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'proxies', filter: `user_id=eq.${uid}` },
          () => scheduleRefresh()
        )
        .subscribe()
    })
    return () => {
      disposed = true
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      if (channel) supabase.removeChannel(channel)
    }
  }, [workspaceId, enabled, scheduleRefresh])

  // host:port → set of distinct sources present, so we can flag the same
  // endpoint appearing as BOTH a purchased and a custom row.
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
          // Nothing is synced any more — purchased rows are read live.
          lastSyncedRelative: null
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

  const removeRow = async (id: string): Promise<void> => {
    const row = rows.find((p) => p.id === id)
    if (row && row.source !== 'custom') {
      throw new Error('Purchased proxies are managed on tubeproxies.com — cancel or swap it there.')
    }
    await deleteProxy(id)
    setRows((prev) => prev.filter((p) => p.id !== id))
  }

  const insertLocal = (row: ProxyRow): void => {
    // Same guard as the realtime handler — whichever path arrives second is
    // a no-op instead of a duplicate row.
    setRows((prev) => (prev.some((p) => p.id === row.id) ? prev : [row, ...prev]))
    setProfileNumbers((prev) => ({ ...prev, [row.id]: [] }))
  }

  // Apply an already-persisted patch to the list in place, so the table
  // reflects an edit made in the drawer without a full re-fetch.
  //
  // Required for label/notes edits: the drawer used to update only its own
  // copy of the row, leaving the Tag column (and the label search filter)
  // showing the stale value until the next Refresh. Purchased proxies make
  // this worse — their label/notes live in ghost.proxy_annotations, which no
  // realtime subscription watches, so nothing else would ever heal the list.
  const patchLocal = (id: string, patch: Partial<ProxyRow>): void => {
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  return {
    rows,
    view,
    countries,
    counts,
    loading,
    error,
    removeRow,
    insertLocal,
    patchLocal,
    refresh
  }
}
