import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { roleIcon, roleTone } from './roleVisuals'
import type { AppRoleRow, ViewMember } from './types'

// Rank of the top-level Owner role (seeded at 0 in 0002_full_schema.sql; lower
// = more powerful). Roles at this rank are excluded from the assign menu.
const OWNER_HIERARCHY = 0

/**
 * RolePill — the member's role as a TubeGhost pill; when the caller may
 * assign roles it opens an "ASSIGN ROLE" dropdown of the workspace's roles,
 * with a checkmark on the current one (matches the Members redesign mockup).
 */
export function RolePill({
  member,
  roles,
  canAssign,
  busy,
  onSelect,
  open: controlledOpen,
  onOpenChange
}: {
  member: ViewMember
  roles: AppRoleRow[]
  canAssign: boolean
  busy: boolean
  onSelect: (roleId: string) => void
  // Optional controlled open state (so the row kebab's "Change role" can open it).
  open?: boolean
  onOpenChange?: (open: boolean) => void
}): React.ReactElement {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (v: boolean): void => {
    setUncontrolledOpen(v)
    onOpenChange?.(v)
  }
  const wrapRef = useRef<HTMLDivElement>(null)

  // Owner is never assignable from this menu — handing over ownership is a
  // deliberate transfer, not a role tweak, and letting it happen here would
  // silently create a second owner (the server's hierarchy guard permits it,
  // since an Owner's rank is <= Owner's rank).
  //
  // Matched on `hierarchy`, never on the name: role names are configuration and
  // are workspace-editable, so a name check would break on a renamed or custom
  // top-rank role. See CLAUDE.md — "NEVER check role names".
  const assignableRoles = roles.filter((r) => r.hierarchy > OWNER_HIERARCHY)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!canAssign) {
    return (
      <span className={'role ' + roleTone(member.roleName)}>
        {roleIcon(member.roleName)}
        {member.roleName}
      </span>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <span
        className={'role role-pick ' + roleTone(member.roleName)}
        style={busy ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
        onClick={() => setOpen(!open)}
        title="Change role"
      >
        {roleIcon(member.roleName)}
        {member.roleName}
        <ChevronDown className="role-chev" size={13} />
      </span>
      {open && (
        <div
          className="role-list"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 80,
            minWidth: '190px',
            boxShadow: 'var(--shadow-pop)'
          }}
        >
          <div className="role-list-h">Assign role</div>
          {assignableRoles.map((r) => {
            const active = r.id === member.roleId
            return (
              <button
                key={r.id}
                onClick={() => {
                  setOpen(false)
                  onSelect(r.id)
                }}
                className="rl-item w-full text-left"
                style={{ color: active ? 'var(--red)' : 'var(--t1)' }}
              >
                <span className={'role-ico ' + roleTone(r.name)} style={{ display: 'inline-flex' }}>
                  {roleIcon(r.name, 15)}
                </span>
                <span style={{ fontWeight: active ? 600 : 500 }}>{r.name}</span>
                {active && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--red)' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
