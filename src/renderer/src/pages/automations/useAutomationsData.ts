// Owns Automations-page data: load automations (with derived run stats) + the
// groups/profiles needed for the scope pickers, plus a Supabase realtime
// subscription so stat cards + rows stay live. Mutations write through
// lib/automations.ts (RLS-gated) and update local state optimistically.
//
// Config-only in the web app: automations are created/edited/duplicated here,
// but flow EXECUTION (which drove the local browser engine) is dropped.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import {
  listAutomations,
  setAutomationEnabled,
  deleteAutomation,
  duplicateAutomation,
  type AutomationWithMeta
} from '@/lib/automations'
import { listGroups, type GroupRow } from '@/lib/groups'
import { listProfiles, type ProfileRow } from '@/lib/profiles'

export interface UseAutomationsDataResult {
  autos: AutomationWithMeta[]
  groups: GroupRow[]
  profiles: ProfileRow[]
  activeCount: number
  totalRuns30d: number
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  toggle: (id: string, enabled: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  duplicate: (a: AutomationWithMeta) => Promise<void>
}

export function useAutomationsData(
  workspaceId: string | null,
  enabled: boolean
): UseAutomationsDataResult {
  const [autos, setAutos] = useState<AutomationWithMeta[]>([])
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loading = !loaded

  const reload = useCallback(async () => {
    if (!workspaceId) return
    const [a, g, p] = await Promise.all([
      listAutomations(workspaceId),
      listGroups(workspaceId),
      listProfiles(workspaceId)
    ])
    setAutos(a)
    setGroups(g)
    setProfiles(p)
    setError(null)
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId || !enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true)
      return
    }
    let cancelled = false
    setLoaded(false)
    reload()
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [workspaceId, enabled, reload])

  // Realtime: refresh the list on any automations/runs change in the workspace.
  useEffect(() => {
    if (!workspaceId || !enabled) return
    const supabase = getSupabase()
    if (!supabase) return
    const channel = supabase
      .channel(`automations:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'ghost',
          table: 'automations',
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => void reload().catch(() => undefined)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'ghost',
          table: 'automation_runs',
          filter: `workspace_id=eq.${workspaceId}`
        },
        () => void reload().catch(() => undefined)
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, enabled, reload])

  const activeCount = useMemo(() => autos.filter((a) => a.enabled).length, [autos])
  const totalRuns30d = useMemo(() => autos.reduce((n, a) => n + a.runsCount, 0), [autos])

  const toggle = useCallback(async (id: string, next: boolean) => {
    setAutos((as) => as.map((a) => (a.id === id ? { ...a, enabled: next } : a)))
    try {
      await setAutomationEnabled(id, next)
    } catch (e) {
      setAutos((as) => as.map((a) => (a.id === id ? { ...a, enabled: !next } : a)))
      throw e
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteAutomation(id)
    setAutos((as) => as.filter((a) => a.id !== id))
  }, [])

  const duplicate = useCallback(
    async (a: AutomationWithMeta) => {
      await duplicateAutomation(a, useAuth.getState().user?.id ?? null)
      await reload().catch(() => undefined)
    },
    [reload]
  )

  return {
    autos,
    groups,
    profiles,
    activeCount,
    totalRuns30d,
    loading,
    error,
    reload,
    toggle,
    remove,
    duplicate
  }
}
