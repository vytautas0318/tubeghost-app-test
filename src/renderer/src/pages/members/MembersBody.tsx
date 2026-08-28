import * as React from 'react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Clock, ShieldAlert, UserPlus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useWorkspace } from '@/store/workspace'
import { useAuth } from '@/store/auth'
import { useHasAnyPermission, useHasPermission, useIsPreview } from '@/lib/permissions'
import { Button } from '@tubeghost/ui'
import { ToastView, useToast } from '@/components/Toast'
import { undeliveredMessage } from '@/lib/invitations'
import { useTeamHeaderSlot } from '../team/TeamHeaderContext'
import { useMembersData } from './useMembersData'
import { useInvitationsData } from './useInvitationsData'
import { useMemberStats } from './useMemberStats'
import { filterAndSortMembers } from './filters'
import { MembersToolbar } from './MembersToolbar'
import { MemberListRow } from './MemberListRow'
import { MemberInviteRow } from './MemberInviteRow'
import { InviteDialog } from './InviteDialog'
import { ConfirmRemoveModal } from './ConfirmRemoveModal'
import { useMemberActions } from './useMemberActions'
import type { SortKey, StatusFilter, ViewMember } from './types'

/**
 * MembersBody — the former Members page content, extracted verbatim to render
 * inside the shared TeamPage tabbed shell. Data fetching, permissions and
 * mutations are unchanged; only the outer page-shell + <h1>/subtitle/action
 * were lifted into TeamPage (subtitle + Invite button pushed back up via
 * useTeamHeaderSlot).
 */
export function MembersBody(): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast, show } = useToast(4500)

  const canViewMembers = useHasAnyPermission('members.view', 'roles.view')
  const canAssignRole = useHasPermission('members.assign_role')
  const canRemove = useHasPermission('members.remove')
  const canDisable = useHasPermission('members.disable')
  const canInvite = useHasPermission('members.invite')
  const isPreview = useIsPreview()

  const wsId = workspace?.workspace_id ?? null
  const { roles, view, loading, error, changeRole, remove, setStatus } = useMembersData(
    wsId,
    canViewMembers
  )
  const stats = useMemberStats(wsId, workspace?.plan ?? null)
  const roleNameById = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])
  const invites = useInvitationsData(wsId, roleNameById, canViewMembers)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortKey>('role')
  const [confirmRemove, setConfirmRemove] = useState<ViewMember | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  const wsName = workspace?.workspace_name ?? 'Workspace'
  const ownerCount = useMemo(() => view.filter((v) => v.roleName === 'Owner').length, [view])

  // Rank lookup + the caller's own rank. Lower number = more powerful (Owner=0).
  // Used to stop a member acting on someone at or above their own rank — e.g. an
  // Admin must not be able to change the role of, suspend, or remove the Owner.
  const hierarchyByRoleId = useMemo(() => new Map(roles.map((r) => [r.id, r.hierarchy])), [roles])
  const myHierarchy = useMemo(() => {
    const me = view.find((v) => v.userId === user?.id)
    const h = me?.roleId ? hierarchyByRoleId.get(me.roleId) : undefined
    // Unknown rank → treat as the weakest possible, so we fail closed.
    return h ?? Number.MAX_SAFE_INTEGER
  }, [view, user?.id, hierarchyByRoleId])

  // True when the caller outranks this row strictly (my rank is a smaller
  // number). Rows at or above the caller's rank are read-only to them.
  const outranks = (m: (typeof view)[number]): boolean => {
    const target = m.roleId ? hierarchyByRoleId.get(m.roleId) : undefined
    if (target === undefined) return false // unknown target rank → fail closed
    return myHierarchy < target
  }
  const rows = useMemo(
    () => filterAndSortMembers(view, query, statusFilter, sort),
    [view, query, statusFilter, sort]
  )

  const actions = useMemberActions({ changeRole, remove, setStatus }, roles, user, ownerCount, show)

  // Members-specific subtitle ("1 of 25 seats used · macos-test") + the
  // Invite-member action, rendered in the shared TeamPage header.
  const showInvite = canViewMembers && canInvite && !isPreview
  const pendingCount = invites.pending.length
  useTeamHeaderSlot(
    {
      subtitle: stats.seatLimit
        ? `${view.length} of ${stats.seatLimit} seats used · ${wsName}`
        : `${view.length} member${view.length === 1 ? '' : 's'} · ${wsName}`,
      action: (
        <>
          {pendingCount > 0 && (
            <span className="pending-pill" title="Pending invitations">
              <Clock size={13} />
              Pending
              <b>{pendingCount}</b>
            </span>
          )}
          {showInvite && (
            <Button
              variant="primary"
              icon={<UserPlus size={15} />}
              onClick={() => setInviteOpen(true)}
            >
              Invite member
            </Button>
          )}
        </>
      )
    },
    [view.length, stats.seatLimit, wsName, pendingCount, showInvite]
  )

  if (!canViewMembers) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <ShieldAlert className="w-8 h-8 mx-auto mb-3 text-[var(--t4)]" />
          <h3 className="text-sm font-bold text-[var(--t1)] mb-1">
            You don&apos;t have access to members
          </h3>
          <p className="text-xs text-[var(--t3)]">
            Ask a workspace admin for the <span className="mono">members.view</span> permission.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <MembersToolbar
        query={query}
        status={statusFilter}
        sort={sort}
        onQuery={setQuery}
        onStatus={setStatusFilter}
        onSort={setSort}
      />

      {loading && (
        <div className="mtable">
          <div className="p-8 text-center text-sm text-[var(--t3)]">Loading members…</div>
        </div>
      )}

      {!loading && error && (
        <div className="mtable">
          <div className="p-8 text-center">
            <AlertCircle className="w-7 h-7 mx-auto mb-2 text-[var(--red)]" />
            <div className="text-sm font-bold text-[var(--t1)] mb-1">Failed to load members</div>
            <div className="text-xs text-[var(--t3)]">{error}</div>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="mtable">
          <div className="mhead">
            <div className="th">Member</div>
            <div className="th">Role</div>
            <div className="th">Profiles</div>
            <div className="th">Proxies</div>
            <div className="th">Last seen</div>
            <div className="th" />
          </div>

          {rows.map((m) => (
            <MemberListRow
              key={m.userId}
              member={m}
              roles={roles}
              profileCount={stats.profileCounts.get(m.userId) ?? 0}
              proxyCount={stats.proxyCounts.get(m.userId) ?? 0}
              actions={{
                isMe: user?.id === m.userId,
                // Each action additionally requires outranking the target row,
                // so nobody can act on a peer or a superior (e.g. an Admin on
                // the Owner). Mirrors the can_user_modify_role hierarchy rule.
                canAssignRole: canAssignRole && !isPreview && outranks(m),
                canRemove: canRemove && !isPreview && outranks(m),
                canDisable: canDisable && !isPreview && outranks(m),
                isSoleOwner: m.roleName === 'Owner' && ownerCount === 1,
                busyRole: actions.pendingChange === m.userId,
                onRoleChange: (roleId) => void actions.changeRole(m, roleId),
                onRemove: () => setConfirmRemove(m),
                onDisable: () => void actions.setStatus(m, 'disabled'),
                onEnable: () => void actions.setStatus(m, 'active'),
                onViewProfiles: () => navigate(`/profiles?assignedTo=${m.userId}`)
              }}
            />
          ))}

          {/* Pending invitations render as greyed rows in the same table. */}
          {statusFilter === 'all' &&
            query.trim() === '' &&
            invites.pending.map((inv) => (
              <MemberInviteRow
                key={inv.id}
                inv={inv}
                invitedRelative={formatDistanceToNow(new Date(inv.created_at), {
                  addSuffix: true
                })}
                canManage={canInvite && !isPreview}
                onCopy={(text) => {
                  void navigator.clipboard.writeText(text)
                  show('success', 'Invitation link copied.')
                }}
                onResend={async (id) => {
                  const r = await invites.resend(id)
                  if (!r.ok) show('error', r.message || 'Resend failed.')
                  else if (r.delivery === 'sent')
                    show('success', `Invitation resent to ${inv.email}.`)
                  else show('info', undeliveredMessage(inv.email, r.deliveryReason))
                  return r
                }}
                onRevoke={async (id) => {
                  const r = await invites.revoke(id)
                  show(r.ok ? 'success' : 'error', r.ok ? 'Invitation revoked.' : 'Revoke failed.')
                  return r
                }}
              />
            ))}

          {rows.length === 0 && invites.pending.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--t3)]">
              {view.length === 0
                ? 'No members yet — invite your team to collaborate.'
                : 'No members match your search.'}
            </div>
          )}
        </div>
      )}

      {inviteOpen && (
        <InviteDialog
          roles={roles}
          onClose={() => setInviteOpen(false)}
          onSubmit={async (input) => {
            const r = await invites.create(input)
            if (r.ok) {
              // Distinguish a real delivery from "invited but the email didn't
              // send" — the latter used to show a false success and leave the
              // invitee waiting for a mail that never arrived. On failure, point
              // the owner at the copy-link fallback in the pending list.
              if (r.delivery === 'sent') {
                show('success', `Invitation email sent to ${input.email}.`)
              } else {
                show('info', undeliveredMessage(input.email, r.deliveryReason))
              }
            }
            return r
          }}
        />
      )}

      {confirmRemove && (
        <ConfirmRemoveModal
          member={confirmRemove}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            const target = confirmRemove
            setConfirmRemove(null)
            void actions.remove(target)
          }}
        />
      )}
      <ToastView toast={toast} />
    </>
  )
}
