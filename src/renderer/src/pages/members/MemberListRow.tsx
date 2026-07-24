import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Layers as LayersIcon,
  MoreVertical,
  Trash2,
  UserCog
} from 'lucide-react'
import { GhostAvatar } from '@/components/GhostAvatar'
import { RolePill } from './RolePill'
import { MemberStatusBadge } from './MemberStatusBadge'
import { localPart } from './types'
import type { AppRoleRow, ViewMember } from './types'

const PRESENCE_COLOR: Record<'on' | 'off', string> = {
  on: 'var(--green)',
  off: 'var(--t4)'
}

// The member's composable ghost avatar with a presence dot — same tile the
// sidebar renders (GhostAvatar from avatar_config), plus the online dot the
// old initials Avatar carried.
function MemberAvatar({
  member,
  presence
}: {
  member: ViewMember
  presence: 'on' | 'off'
}): React.ReactElement {
  const a = member.avatarConfig
  return (
    <span style={{ position: 'relative', display: 'inline-grid', flexShrink: 0 }}>
      <GhostAvatar
        size={36}
        radius={10}
        color={a.color}
        face={a.face}
        glasses={a.glasses}
        hat={a.hat}
        hand={a.hand}
      />
      <span
        style={{
          position: 'absolute',
          bottom: '-2px',
          right: '-2px',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          border: '2.5px solid var(--panel)',
          background: PRESENCE_COLOR[presence]
        }}
      />
    </span>
  )
}

export interface MemberRowActions {
  isMe: boolean
  canAssignRole: boolean
  canRemove: boolean
  canDisable: boolean
  isSoleOwner: boolean
  busyRole: boolean
  onRoleChange: (roleId: string) => void
  onRemove: () => void
  onDisable: () => void
  onEnable: () => void
  onViewProfiles: () => void // stub — feature pending
  onReset2fa: () => void // stub — feature pending
}

export function MemberListRow({
  member,
  roles,
  profileCount,
  proxyCount,
  actions
}: {
  member: ViewMember
  roles: AppRoleRow[]
  profileCount: number
  proxyCount: number
  actions: MemberRowActions
}): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const name = member.displayName ?? localPart(member.email) ?? member.userId.slice(0, 8)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const protectedRow = actions.isMe && actions.isSoleOwner
  const isDisabled = member.status === 'disabled'
  // The kebab always has items (view profiles + reset 2FA are available to all),
  // except for the sole-owner self row which stays protected.
  const hasMenu = !protectedRow
  // Active-member presence: green dot when recently seen, else off.
  const presence = member.status === 'disabled' ? 'off' : 'on'

  return (
    <div className="mrow" style={isDisabled ? { opacity: 0.55 } : undefined}>
      <div className="muser">
        <MemberAvatar member={member} presence={presence} />
        <div style={{ minWidth: 0 }}>
          <div className="mname" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
            {actions.isMe && <span style={{ color: 'var(--t3)', fontWeight: 500 }}>· you</span>}
            {isDisabled && <MemberStatusBadge status={member.status} />}
          </div>
          <div className="memail">{member.email ?? '—'}</div>
        </div>
      </div>

      <div>
        <RolePill
          member={member}
          roles={roles}
          canAssign={actions.canAssignRole}
          busy={actions.busyRole}
          onSelect={actions.onRoleChange}
          open={roleOpen}
          onOpenChange={setRoleOpen}
        />
      </div>

      <div className="mstat">
        {profileCount} <small>profiles</small>
      </div>
      <div className="mstat">
        {proxyCount} <small>proxies</small>
      </div>

      <div className="mseen">{member.lastSeenRelative ?? member.joinedAtRelative}</div>

      <div
        ref={menuRef}
        style={{ display: 'flex', justifyContent: 'flex-end', position: 'relative' }}
      >
        {hasMenu && (
          <button title="Member actions" className="kebab" onClick={() => setMenuOpen((v) => !v)}>
            <MoreVertical size={15} />
          </button>
        )}
        {menuOpen && (
          <div
            className="role-list"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              zIndex: 80,
              minWidth: 210,
              boxShadow: 'var(--shadow-pop)'
            }}
          >
            <button
              className="mm-item"
              onClick={() => {
                setMenuOpen(false)
                actions.onViewProfiles()
              }}
            >
              <LayersIcon size={14} /> View assigned profiles
            </button>
            {actions.canAssignRole && !actions.isMe && (
              <button
                className="mm-item"
                onClick={() => {
                  setMenuOpen(false)
                  setRoleOpen(true)
                }}
              >
                <UserCog size={14} /> Change role
              </button>
            )}
            <button
              className="mm-item"
              onClick={() => {
                setMenuOpen(false)
                actions.onReset2fa()
              }}
            >
              <KeyRound size={14} /> Reset 2FA
            </button>
            {actions.canDisable && !actions.isMe && (
              <button
                className="mm-item"
                onClick={() => {
                  setMenuOpen(false)
                  isDisabled ? actions.onEnable() : actions.onDisable()
                }}
              >
                {isDisabled ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                {isDisabled ? 'Restore access' : 'Suspend access'}
              </button>
            )}
            {actions.canRemove && !actions.isMe && (
              <button
                className="mm-item mm-danger"
                onClick={() => {
                  setMenuOpen(false)
                  actions.onRemove()
                }}
              >
                <Trash2 size={14} /> Remove from workspace
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
