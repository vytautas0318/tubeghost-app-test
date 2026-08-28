// Team → Profile access. Roles decide WHAT a member may do; this decides WHICH
// profiles it applies to (migration 0023).
//
// Two rules are stated plainly on screen because both surprise people:
//   * Ungrouped profiles are ADMIN-ONLY while the toggle is on. A profile must
//     be in a group to be shared.
//   * Grants are per-user, so two Editors can hold different profile sets.

import * as React from 'react'
import { useState } from 'react'
import { Check, ChevronDown, FolderLock, Lock, Users } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { ToastView, useToast } from '@/components/Toast'
import { useTeamHeaderSlot } from './TeamHeaderContext'
import { useProfileAccessData } from './useProfileAccessData'
import { useMembersData } from '../members/useMembersData'

export function ProfileAccessBody(): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const workspaceId = workspace?.workspace_id ?? null
  const canManage = useHasPermission('members.assign_role')
  const canToggle = useHasPermission('workspace.edit_settings')
  const { toast, show } = useToast()

  const access = useProfileAccessData(workspaceId)
  const { view: members } = useMembersData(workspaceId, true)

  useTeamHeaderSlot(
    {
      subtitle: access.restricted
        ? 'Members see only the profile groups they are granted.'
        : 'All members see every profile. Turn on restricted access to limit by group.',
      action: null
    },
    [access.restricted]
  )

  if (access.loading) return <p className="text-sm text-[var(--t3)]">Loading access…</p>
  if (access.error) return <p className="text-sm text-[var(--red)]">{access.error}</p>

  const activeMembers = members.filter((m) => m.status === 'active')

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex items-start gap-3">
          <Lock className="w-4 h-4 mt-0.5 text-[var(--t3)] shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--t1)]">Restrict profiles by group</h3>
            <p className="mt-1 text-xs text-[var(--t3)]">
              Roles decide what a member can do. This decides which profiles it applies to.
              Workspace admins always see everything.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={access.restricted}
            disabled={!canToggle}
            onClick={() => {
              const next = !access.restricted
              void access
                .setRestricted(next)
                .then(() => show('success', next ? 'Restricted access on' : 'Restriction off'))
                .catch((e: Error) => show('error', e.message))
            }}
            title={!canToggle ? 'Only a workspace admin can change this' : undefined}
            className={
              'shrink-0 w-10 h-6 rounded-full transition-colors relative disabled:opacity-40 ' +
              (access.restricted ? 'bg-[var(--red)]' : 'bg-[var(--line)]')
            }
          >
            <span
              className={
                'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ' +
                (access.restricted ? 'left-[18px]' : 'left-0.5')
              }
            />
          </button>
        </div>

        {/* Called out rather than buried: this is the rule people trip over,
            and the remedy ("put it in a group") is not guessable. */}
        {access.restricted && (
          <div className="mt-3 flex items-start gap-2.5 rounded-md bg-[var(--panel-2)] px-3 py-2">
            <FolderLock className="w-3.5 h-3.5 mt-0.5 text-[var(--t3)] shrink-0" />
            <p className="text-[11px] text-[var(--t3)]">
              Profiles that are not in any group are visible to workspace admins only. Put a profile
              in a group to share it.
            </p>
          </div>
        )}
      </section>

      {access.groups.length === 0 ? (
        <p className="text-sm text-[var(--t3)]">
          No groups yet — create one on the Profiles page, then grant access to it here.
        </p>
      ) : (
        <div className="space-y-2">
          {access.groups.map((g) => (
            <GroupAccessRow
              key={g.id}
              name={g.name}
              color={g.color}
              dimmed={!access.restricted}
              members={activeMembers}
              granted={access.usersWithAccess(g.id)}
              canManage={canManage}
              onToggleMember={(userId, on) => {
                const p = on ? access.grant(g.id, userId) : access.revoke(g.id, userId)
                void p.catch((e: Error) => show('error', e.message))
              }}
            />
          ))}
        </div>
      )}

      <ToastView toast={toast} position="bottom-center" />
    </div>
  )
}

function GroupAccessRow({
  name,
  color,
  dimmed,
  members,
  granted,
  canManage,
  onToggleMember
}: {
  name: string
  color: string
  dimmed: boolean
  members: { userId: string; email: string | null; displayName: string | null }[]
  granted: Set<string>
  canManage: boolean
  onToggleMember: (userId: string, on: boolean) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={
        'rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--panel)] ' +
        (dimmed ? 'opacity-60' : '')
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left"
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: color }}
          aria-hidden="true"
        />
        <span className="text-sm font-semibold text-[var(--t1)] flex-1 min-w-0 truncate">
          {name}
        </span>
        <span className="text-xs text-[var(--t3)] inline-flex items-center gap-1.5 shrink-0">
          <Users className="w-3.5 h-3.5" />
          {granted.size === 0 ? 'No one' : `${granted.size} with access`}
        </span>
        <ChevronDown
          className={'w-4 h-4 text-[var(--t3)] transition-transform ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {open && (
        <div className="border-t border-[var(--line)] py-1">
          {members.length === 0 && (
            <p className="px-4 py-2 text-xs text-[var(--t3)]">No active members.</p>
          )}
          {members.map((m) => {
            const on = granted.has(m.userId)
            const label = m.displayName ?? m.email ?? m.userId.slice(0, 8)
            return (
              <button
                key={m.userId}
                type="button"
                disabled={!canManage}
                onClick={() => onToggleMember(m.userId, !on)}
                title={!canManage ? 'You cannot manage access' : undefined}
                className="w-full px-4 py-2 flex items-center gap-2.5 text-xs hover:bg-[var(--hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span
                  className={
                    'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ' +
                    (on ? 'bg-[var(--red)] border-[var(--red)]' : 'border-[var(--line)]')
                  }
                >
                  {on && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <span className="text-[var(--t1)] truncate">{label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
