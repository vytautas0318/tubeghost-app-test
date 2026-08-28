// Data for Team → Profile access: the workspace restriction toggle plus the
// per-group, per-user grants (migration 0023).

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  grantGroupAccess,
  isGroupRestrictionEnabled,
  listGroupAccess,
  listGroups,
  revokeGroupAccess,
  setGroupRestriction,
  type GroupAccessRow,
  type GroupRow
} from '@/lib/groups'

export interface UseProfileAccessData {
  groups: GroupRow[]
  grants: GroupAccessRow[]
  restricted: boolean
  loading: boolean
  error: string | null
  usersWithAccess: (groupId: string) => Set<string>
  setRestricted: (on: boolean) => Promise<void>
  grant: (groupId: string, userId: string) => Promise<void>
  revoke: (groupId: string, userId: string) => Promise<void>
  reload: () => Promise<void>
}

export function useProfileAccessData(workspaceId: string | null): UseProfileAccessData {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [grants, setGrants] = useState<GroupAccessRow[]>([])
  const [restricted, setRestrictedState] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (!workspaceId) return
    try {
      const [g, a, r] = await Promise.all([
        listGroups(workspaceId),
        listGroupAccess(workspaceId),
        isGroupRestrictionEnabled(workspaceId)
      ])
      setGroups(g)
      setGrants(a)
      setRestrictedState(r)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  const byGroup = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const a of grants) {
      const set = m.get(a.group_id) ?? new Set<string>()
      set.add(a.user_id)
      m.set(a.group_id, set)
    }
    return m
  }, [grants])

  const usersWithAccess = useCallback(
    (groupId: string): Set<string> => byGroup.get(groupId) ?? new Set<string>(),
    [byGroup]
  )

  // Every mutation re-reads instead of patching local state: RLS can reject a
  // write the UI expected to succeed, and an optimistic row would then show
  // access that does not exist — the worst possible lie on a permissions screen.
  const setRestricted = async (on: boolean): Promise<void> => {
    if (!workspaceId) return
    await setGroupRestriction(workspaceId, on)
    await load()
  }

  const grant = async (groupId: string, userId: string): Promise<void> => {
    if (!workspaceId) return
    await grantGroupAccess(workspaceId, groupId, userId)
    await load()
  }

  const revoke = async (groupId: string, userId: string): Promise<void> => {
    await revokeGroupAccess(groupId, userId)
    await load()
  }

  return {
    groups,
    grants,
    restricted,
    loading,
    error,
    usersWithAccess,
    setRestricted,
    grant,
    revoke,
    reload: load
  }
}
