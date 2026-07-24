// Data layer for the Profiles list page: query + realtime subscription.

import { useEffect, useState } from 'react'
import { listProfiles, type ProfileRow } from '@/lib/profiles'
import { getSupabase } from '@/lib/supabase'

export interface UseProfilesListDataResult {
  rows: ProfileRow[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useProfilesListData(workspaceId: string | null): UseProfilesListDataResult {
  const [rows, setRows] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // bumping this re-triggers the fetch effect; lets row menus force a
  // refresh on demand if the realtime subscription dropped.
  const [reloadTick, setReloadTick] = useState(0)
  const reload = (): void => setReloadTick((n) => n + 1)

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    setLoading(true)
    listProfiles(workspaceId)
      .then((data) => {
        if (cancelled) return
        setRows(data)
        setError(null)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
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
        { event: '*', schema: 'public', table: 'profiles', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === 'INSERT') return [payload.new as ProfileRow, ...prev]
            if (payload.eventType === 'DELETE') {
              return prev.filter((p) => p.id !== (payload.old as ProfileRow).id)
            }
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as ProfileRow
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

  return { rows, loading, error, reload }
}
