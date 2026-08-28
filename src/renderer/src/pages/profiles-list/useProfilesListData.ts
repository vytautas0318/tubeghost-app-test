// Data layer for the Profiles list page: query + realtime subscription.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listProfiles, type ProfileRow } from '@/lib/profiles'
import { getSupabase } from '@/lib/supabase'

export interface UseProfilesListDataResult {
  rows: ProfileRow[]
  // True ONLY while the first fetch for a workspace is in flight. Refreshes
  // keep it false so the page never swaps the table for a spinner — see the
  // note on `reload` below.
  loading: boolean
  error: string | null
  reload: () => void
  // Apply an already-known updated row in place, with no network round trip.
  // This is the right call for inline edits (group / proxy / tags / rename):
  // the mutation already returned the new row, so re-querying the whole
  // workspace just to learn what we were handed is wasted work — and it used
  // to blank the page while it ran.
  patchRow: (row: ProfileRow) => void
}

export function useProfilesListData(workspaceId: string | null): UseProfilesListDataResult {
  const [rows, setRows] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // bumping this re-triggers the fetch effect; lets row menus force a
  // refresh on demand if the realtime subscription dropped.
  const [reloadTick, setReloadTick] = useState(0)
  const reload = useCallback((): void => setReloadTick((n) => n + 1), [])
  // Which workspace we've already rendered rows for. A refetch of the SAME
  // workspace is a background refresh (stale-while-revalidate): the current
  // table stays on screen and is swapped when the new data lands. Switching
  // workspaces is a genuine cold load and does show the spinner.
  const loadedFor = useRef<string | null>(null)

  const patchRow = useCallback((row: ProfileRow): void => {
    setRows((prev) => prev.map((p) => (p.id === row.id ? row : p)))
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    const isColdLoad = loadedFor.current !== workspaceId
    if (isColdLoad) setLoading(true)
    listProfiles(workspaceId)
      .then((data) => {
        if (cancelled) return
        setRows(data)
        setError(null)
        loadedFor.current = workspaceId
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && isColdLoad && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [workspaceId, reloadTick])

  useEffect(() => {
    if (!workspaceId) return
    const supabase = getSupabase()
    if (!supabase) return
    const channel = supabase
      .channel(`profiles:${workspaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'ghost', table: 'browser_profiles', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === 'INSERT') {
              const next = payload.new as ProfileRow
              // Drafts are desktop-editor scratch rows and are excluded from
              // the list query — so they must be excluded here too, or a
              // teammate merely OPENING the editor makes a phantom profile
              // appear in an already-loaded web list.
              if (next.is_draft) return prev
              // The row may already be here: creating/duplicating a profile
              // triggers an immediate refetch (reload(), or this page
              // mounting after the editor navigates back) AND a realtime
              // INSERT for the same row. Without this guard the list shows
              // the new profile twice until the next full reload.
              if (prev.some((p) => p.id === next.id)) return prev
              return [next, ...prev]
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((p) => p.id !== (payload.old as ProfileRow).id)
            }
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as ProfileRow
              // commitProfileDraft() flips is_draft false on first save, which
              // arrives as an UPDATE for a row this list never saw. Treat that
              // as the insert it effectively is; a row that became a draft
              // again (or still is one) is dropped.
              const known = prev.some((p) => p.id === next.id)
              if (next.is_draft) return known ? prev.filter((p) => p.id !== next.id) : prev
              if (!known) return [next, ...prev]
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
  }, [workspaceId])

  // Last line of defence against a row appearing twice: the list is fed by
  // both a fetch and a realtime stream, so any path that races (or a stray
  // second subscription) would otherwise render duplicate React keys AND
  // inflate the group counts. Deduping here keeps every consumer consistent.
  const deduped = useMemo(() => {
    const seen = new Set<string>()
    return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
  }, [rows])

  return { rows: deduped, loading, error, reload, patchRow }
}
