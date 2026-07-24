// Member mutation handlers (role change, remove, enable/disable, preview) with
// toast feedback + the sole-owner guard. Extracted from Members.tsx to keep the
// page a thin composer. Delegates to the data hook's optimistic callbacks.

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useWorkspace } from '@/store/workspace'
import type { UseMembersDataResult } from './useMembersData'
import type { AppRoleRow, MemberStatus, ViewMember } from './types'

type Notify = (kind: 'success' | 'error' | 'info', text: string) => void

export interface MemberActionsApi {
  pendingChange: string | null
  changeRole: (member: ViewMember, newRoleId: string) => Promise<void>
  remove: (member: ViewMember) => Promise<void>
  setStatus: (member: ViewMember, status: MemberStatus) => Promise<void>
  preview: (member: ViewMember) => Promise<void>
}

export function useMemberActions(
  data: Pick<UseMembersDataResult, 'changeRole' | 'remove' | 'setStatus'>,
  roles: AppRoleRow[],
  user: User | null,
  ownerCount: number,
  notify: Notify
): MemberActionsApi {
  const [pendingChange, setPendingChange] = useState<string | null>(null)
  const startPreviewUser = useWorkspace((s) => s.startPreviewUser)

  const changeRole = async (member: ViewMember, newRoleId: string): Promise<void> => {
    if (!user || newRoleId === member.roleId) return
    // Sole-owner guard: don't let the last Owner demote themselves.
    if (member.userId === user.id && member.roleName === 'Owner' && ownerCount === 1) {
      const target = roles.find((r) => r.id === newRoleId)
      if (target && target.name !== 'Owner') {
        notify('error', 'You are the only Owner — promote someone else before changing your role.')
        return
      }
    }
    setPendingChange(member.userId)
    const r = await data.changeRole(member.userId, newRoleId, user.id)
    setPendingChange(null)
    notify(
      r.ok ? 'success' : 'error',
      r.ok
        ? 'Role updated.'
        : r.reason === 'permission'
          ? 'You can only assign roles at or below your hierarchy.'
          : (r.message ?? 'Failed to change role.')
    )
  }

  const remove = async (member: ViewMember): Promise<void> => {
    const r = await data.remove(member.userId)
    notify(
      r.ok ? 'success' : 'error',
      r.ok
        ? 'Member removed.'
        : r.reason === 'permission'
          ? 'You do not have permission to remove this member.'
          : (r.message ?? 'Failed to remove member.')
    )
  }

  const setStatus = async (member: ViewMember, status: MemberStatus): Promise<void> => {
    const r = await data.setStatus(member.userId, status)
    notify(
      r.ok ? 'success' : 'error',
      r.ok
        ? status === 'disabled'
          ? 'Member disabled.'
          : 'Member enabled.'
        : r.reason === 'permission'
          ? 'You do not have permission to change member status.'
          : (r.message ?? 'Failed to update member.')
    )
  }

  const preview = async (member: ViewMember): Promise<void> => {
    const r = await startPreviewUser(member.userId, member.email ?? member.userId)
    if (!r.ok) {
      notify(
        'error',
        r.reason === 'hierarchy'
          ? 'You can only preview roles at or below your own.'
          : (r.message ?? 'Could not start preview.')
      )
    }
  }

  return { pendingChange, changeRole, remove, setStatus, preview }
}
