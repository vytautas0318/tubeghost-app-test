// Owns all data for the Members page: parallel queries, mutations, errors.
// Returns view models + action callbacks; renderer just composes UI.
// Mutations delegate to the MemberService (lib/members.ts) — RLS is the
// source of truth; these callbacks apply optimistic local updates.

import { avatarConfigFrom, MemberResult } from '@tubeghost/ui'
import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { getSupabase } from '@/lib/supabase'
import { getWorkspaceUserDetailsMap, type WorkspaceUserDetails } from '@/lib/users'
import * as MemberService from '@tubeghost/ui'
import type { AppRoleRow, MemberRow, MemberStatus, UserRoleRow, ViewMember } from './types'

export interface UseMembersDataResult {
  members: MemberRow[]
  userRoles: UserRoleRow[]
  roles: AppRoleRow[]
  view: ViewMember[]
  loading: boolean
  error: string | null
  changeRole: (userId: string, newRoleId: string, callerUid: string) => Promise<MemberResult>
  remove: (userId: string) => Promise<MemberResult>
  setStatus: (userId: string, status: MemberStatus) => Promise<MemberResult>
}

function relative(iso: string | null): string | null {
  if (!iso) return null
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

export function useMembersData(workspaceId: string | null, enabled: boolean): UseMembersDataResult {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([])
  const [roles, setRoles] = useState<AppRoleRow[]>([])
  const [userDetails, setUserDetails] = useState<Map<string, WorkspaceUserDetails>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId || !enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const supabase = getSupabase()
    if (!supabase) {
      setError('Supabase not configured')
      setLoading(false)
      return
    }

    Promise.all([
      supabase
        .from('workspace_members')
        .select('user_id, joined_at, invited_by, status, last_seen_at')
        .eq('workspace_id', workspaceId),
      supabase
        .from('user_roles')
        .select('user_id, role_id, workspace_id')
        .eq('workspace_id', workspaceId),
      supabase
        .from('app_roles')
        .select('id, name, hierarchy, color, is_default')
        .eq('workspace_id', workspaceId)
        .order('hierarchy', { ascending: true }),
      getWorkspaceUserDetailsMap(workspaceId).catch((e: Error) => {
        // eslint-disable-next-line no-console
        console.warn('[Members] failed to fetch user details:', e.message)
        return new Map<string, WorkspaceUserDetails>()
      })
    ])
      .then(([m, ur, ar, detailsMap]) => {
        if (cancelled) return
        if (m.error) throw m.error
        if (ur.error) throw ur.error
        if (ar.error) throw ar.error
        setMembers((m.data ?? []) as MemberRow[])
        setUserRoles((ur.data ?? []) as UserRoleRow[])
        setRoles((ar.data ?? []) as AppRoleRow[])
        setUserDetails(detailsMap)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [workspaceId, enabled])

  const view: ViewMember[] = useMemo(() => {
    const roleById = new Map(roles.map((r) => [r.id, r]))
    const roleByUser = new Map(userRoles.map((ur) => [ur.user_id, ur]))
    return members
      .map((m) => {
        const ur = roleByUser.get(m.user_id)
        const role = ur ? roleById.get(ur.role_id) : undefined
        const details = userDetails.get(m.user_id)
        return {
          userId: m.user_id,
          email: details?.email ?? null,
          displayName: details?.display_name ?? null,
          avatarUrl: details?.avatar_url ?? null,
          avatarConfig: avatarConfigFrom(details?.avatar_config),
          joinedAt: m.joined_at,
          joinedAtRelative: relative(m.joined_at) ?? '—',
          roleId: ur?.role_id ?? null,
          roleName: role?.name ?? '—',
          roleHierarchy: role?.hierarchy ?? null,
          roleColor: role?.color ?? null,
          status: m.status ?? 'active',
          lastSeenRelative: relative(m.last_seen_at)
        }
      })
      .sort((a, b) => {
        const ah = a.roleHierarchy ?? 999
        const bh = b.roleHierarchy ?? 999
        if (ah !== bh) return ah - bh
        return a.joinedAt.localeCompare(b.joinedAt)
      })
  }, [members, userRoles, roles, userDetails])

  const changeRole: UseMembersDataResult['changeRole'] = async (userId, newRoleId, callerUid) => {
    if (!workspaceId) return { ok: false, reason: 'unknown' }
    const r = await MemberService.changeRole(workspaceId, userId, newRoleId, callerUid)
    if (r.ok) {
      setUserRoles((prev) => [
        ...prev.filter((ur) => ur.user_id !== userId),
        { user_id: userId, role_id: newRoleId, workspace_id: workspaceId }
      ])
    }
    return r
  }

  const remove: UseMembersDataResult['remove'] = async (userId) => {
    if (!workspaceId) return { ok: false, reason: 'unknown' }
    const r = await MemberService.removeMember(workspaceId, userId)
    if (r.ok) {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
      setUserRoles((prev) => prev.filter((ur) => ur.user_id !== userId))
    }
    return r
  }

  const setStatus: UseMembersDataResult['setStatus'] = async (userId, status) => {
    if (!workspaceId) return { ok: false, reason: 'unknown' }
    const r = await MemberService.updateMember(workspaceId, userId, { status })
    if (r.ok) {
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, status } : m)))
    }
    return r
  }

  return { members, userRoles, roles, view, loading, error, changeRole, remove, setStatus }
}
