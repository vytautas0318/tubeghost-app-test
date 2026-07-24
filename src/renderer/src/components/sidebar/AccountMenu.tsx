import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut,
  Settings as SettingsIcon,
  HelpCircle,
  CreditCard,
  UserPlus,
  Pencil
} from 'lucide-react'
import { useAuth } from '@/store/auth'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

/**
 * AccountMenu — the popover raised from the sidebar user chip. Account header
 * with the active-workspace role badge, the workspace switcher, the account
 * links (permission-gated), and Sign out.
 *
 * Avatar editing lives in the parent (SidebarUser) because the picker is
 * portalled + anchored to the popover; this component just renders the edit
 * affordance and reports clicks up via `onEditAvatar`.
 */
export function AccountMenu({
  displayName,
  avatarTile,
  onEditAvatar,
  onClose,
  popRef
}: {
  displayName: string
  avatarTile: (px: number, radius: number) => React.ReactElement
  onEditAvatar: (e: React.MouseEvent) => void
  onClose: () => void
  popRef: React.RefObject<HTMLDivElement | null>
}): React.ReactElement {
  const current = useWorkspace((s) => s.current)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  // Menu links map to the ACTIVE workspace's permissions. RLS is the real
  // guard; these gates just avoid surfacing actions the user can't perform.
  const canBilling = useHasPermission('billing.view')
  const canInvite = useHasPermission('members.invite')

  const go = (path: string): void => {
    navigate(path)
    onClose()
  }

  return (
    <div className="acct-pop" ref={popRef}>
      <div className="acct-head">
        <div className="acct-av-edit" title="Customize avatar" onClick={onEditAvatar}>
          {avatarTile(40, 12)}
          <span className="acct-av-pen">
            <Pencil size={10} />
          </span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="acct-name">{displayName}</div>
          <div className="acct-mail">{user?.email}</div>
        </div>
        {current && <span className="acct-role">{current.role_name}</span>}
      </div>

      {current && <WorkspaceSwitcher current={current} />}

      <div className="acct-menu">
        <div className="acct-item" onClick={() => go('/settings')}>
          <SettingsIcon size={16} />
          Account settings
        </div>
        {canBilling && (
          <div className="acct-item" onClick={() => go('/billing')}>
            <CreditCard size={16} />
            Billing &amp; plan
          </div>
        )}
        {canInvite && (
          <div className="acct-item" onClick={() => go('/team/members')}>
            <UserPlus size={16} />
            Invite teammates
          </div>
        )}
        <div
          className="acct-item"
          onClick={() => {
            window.open('https://tubeproxies.com', '_blank', 'noopener')
            onClose()
          }}
        >
          <HelpCircle size={16} />
          Help &amp; support
        </div>
      </div>
      <div className="acct-sep" />
      <div className="acct-menu">
        <div
          className="acct-item danger"
          onClick={() => {
            onClose()
            signOut()
          }}
        >
          <LogOut size={16} />
          Sign out
        </div>
      </div>
    </div>
  )
}
