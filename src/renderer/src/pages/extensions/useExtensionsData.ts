// Owns Extensions-page data: load extensions + assignment, plus the groups
// and profiles needed for the assignment editor and header counts. Mutations
// (toggle, remove, assign, create) write through lib/extensions.ts (RLS-
// gated) and update local state optimistically. Keeps the page component
// focused on layout.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listExtensions,
  setExtensionEnabled,
  deleteExtension,
  setExtensionAssignment,
  type ExtensionWithAssignment,
  type AssignMode
} from '@/lib/extensions'
import { listGroups, type GroupRow } from '@/lib/groups'
import { listProfiles, type ProfileRow } from '@/lib/profiles'

export interface UseExtensionsDataResult {
  exts: ExtensionWithAssignment[]
  groups: GroupRow[]
  profiles: ProfileRow[]
  totalProfiles: number
  syncedProfiles: number
  loading: boolean
  error: string | null
  toggle: (id: string, enabled: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  assign: (
    ext: ExtensionWithAssignment,
    assignment: { mode: AssignMode; groupIds: string[]; profileIds: string[] }
  ) => Promise<void>
  addLocal: (ext: ExtensionWithAssignment) => void
  patchLocal: (id: string, fields: Partial<ExtensionWithAssignment>) => void
}

export function useExtensionsData(
  workspaceId: string | null,
  enabled: boolean
): UseExtensionsDataResult {
  const [exts, setExts] = useState<ExtensionWithAssignment[]>([])
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  // `loaded` flips true once the fetch settles (or is skipped). Deriving
  // `loading` from it — rather than a setState in the effect body — keeps the
  // effect free of synchronous state updates.
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loading = !loaded

  useEffect(() => {
    if (!workspaceId || !enabled) {
      // Nothing to fetch → mark settled. (Matches the pattern in the other
      // page data hooks, e.g. useProxiesData.)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoaded(true)
      return
    }
    let cancelled = false
    setLoaded(false)
    Promise.all([listExtensions(workspaceId), listGroups(workspaceId), listProfiles(workspaceId)])
      .then(([e, g, p]) => {
        if (cancelled) return
        setExts(e)
        setGroups(g)
        setProfiles(p)
        setError(null)
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [workspaceId, enabled])

  const totalProfiles = profiles.length

  // Distinct profiles that would load at least one enabled extension —
  // resolving all / groups / profiles assignment against the profile set.
  const syncedProfiles = useMemo(() => {
    const groupOf = new Map(profiles.map((p) => [p.id, p.group_id]))
    const covered = new Set<string>()
    for (const e of exts) {
      if (!e.enabled) continue
      if (e.assign_mode === 'all') {
        for (const p of profiles) covered.add(p.id)
      } else if (e.assign_mode === 'profiles') {
        for (const pid of e.profileIds) if (groupOf.has(pid)) covered.add(pid)
      } else if (e.assign_mode === 'groups') {
        const gset = new Set(e.groupIds)
        for (const p of profiles) if (p.group_id && gset.has(p.group_id)) covered.add(p.id)
      }
    }
    return covered.size
  }, [exts, profiles])

  const toggle = useCallback(async (id: string, next: boolean) => {
    setExts((es) => es.map((e) => (e.id === id ? { ...e, enabled: next } : e)))
    try {
      await setExtensionEnabled(id, next)
    } catch (e) {
      // Revert on failure.
      setExts((es) => es.map((x) => (x.id === id ? { ...x, enabled: !next } : x)))
      throw e
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteExtension(id)
    setExts((es) => es.filter((e) => e.id !== id))
  }, [])

  const assign = useCallback<UseExtensionsDataResult['assign']>(async (ext, assignment) => {
    await setExtensionAssignment({ id: ext.id, workspace_id: ext.workspace_id }, assignment)
    setExts((es) =>
      es.map((e) =>
        e.id === ext.id
          ? {
              ...e,
              assign_mode: assignment.mode,
              groupIds: assignment.groupIds,
              profileIds: assignment.profileIds
            }
          : e
      )
    )
  }, [])

  const addLocal = useCallback((ext: ExtensionWithAssignment) => {
    setExts((es) => [ext, ...es.filter((e) => e.id !== ext.id)])
  }, [])

  const patchLocal = useCallback((id: string, fields: Partial<ExtensionWithAssignment>) => {
    setExts((es) => es.map((e) => (e.id === id ? { ...e, ...fields } : e)))
  }, [])

  return {
    exts,
    groups,
    profiles,
    totalProfiles,
    syncedProfiles,
    loading,
    error,
    toggle,
    remove,
    assign,
    addLocal,
    patchLocal
  }
}
