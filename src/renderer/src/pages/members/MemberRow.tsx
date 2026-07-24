import * as React from 'react'
import { Eye, Trash2 } from 'lucide-react'
import { localPart, shortId, type AppRoleRow, type ViewMember } from './types'

export function MemberRow({
  member,
  roles,
  isMe,
  isSoleOwner,
  isPending,
  canAssignRole,
  canRemove,
  canPreview,
  onRoleChange,
  onRemove,
  onPreview
}: {
  member: ViewMember
  roles: AppRoleRow[]
  isMe: boolean
  isSoleOwner: boolean
  isPending: boolean
  canAssignRole: boolean
  canRemove: boolean
  canPreview: boolean
  onRoleChange: (newRoleId: string) => void
  onRemove: () => void
  onPreview: () => void
}): React.ReactElement {
  const primary = localPart(member.email) ?? member.displayName ?? shortId(member.userId)

  return (
    <tr className="text-[var(--t1)] hover:bg-[var(--hover)] transition-colors">
      <td className="px-6 py-3">
        <div className="flex items-center gap-2">
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[var(--red-soft-2)] text-[var(--red)] flex items-center justify-center text-[11px] font-bold">
              {primary.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-[var(--t1)] truncate flex items-center">
              {primary}
              {isMe && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[9px] bg-[var(--red-soft)] text-[var(--red)] rounded font-semibold uppercase">
                  You
                </span>
              )}
            </span>
            <span
              className="text-[11px] text-[var(--t3)] truncate"
              title={member.email ?? member.userId}
            >
              {member.email ?? `id: ${shortId(member.userId)}`}
            </span>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5">
        {canAssignRole ? (
          <select
            value={member.roleId ?? ''}
            disabled={isPending}
            onChange={(e) => onRoleChange(e.target.value)}
            className="px-2 py-1 text-xs bg-[var(--panel)] border border-[var(--line)] rounded text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 disabled:opacity-50"
          >
            {member.roleId == null && <option value="">— no role —</option>}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded font-medium"
            style={{
              backgroundColor: `${member.roleColor ?? '#6366f1'}1A`,
              color: member.roleColor ?? '#6366f1'
            }}
          >
            {member.roleName}
          </span>
        )}
      </td>
      <td className="px-2 py-2.5 text-sm text-[var(--t3)]">{member.joinedAtRelative}</td>
      <td className="px-2 py-2.5">
        <div className="flex items-center justify-end gap-0.5">
          {canPreview && !isMe && (
            <button
              title={`Preview as ${member.roleName}${member.email ? ` (${localPart(member.email)})` : ''}`}
              onClick={onPreview}
              className="p-1.5 rounded-[7px] hover:bg-[var(--amber-soft)] text-[var(--t4)] hover:text-[var(--amber)] transition-colors"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          {canRemove && !(isMe && isSoleOwner) && (
            <button
              title="Remove from workspace"
              onClick={onRemove}
              className="p-1.5 rounded-[7px] hover:bg-[var(--red-soft)] text-[var(--t4)] hover:text-[var(--red)] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
