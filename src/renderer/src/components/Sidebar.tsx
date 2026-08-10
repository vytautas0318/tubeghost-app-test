import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useHasAnyPermission, useHasPermission } from '@/lib/permissions'
import { useWorkspace } from '@/store/workspace'
import { NavItem } from '@/components/ui'
import { SidebarUser } from './sidebar/SidebarUser'
import { useProxyAlerts } from './sidebar/useProxyAlerts'
import { NavIcon } from './sidebar/navIcons'
import { OPEN_SEARCH_EVENT } from './CommandPalette'
import { FeatureRequestButton } from './FeatureRequestPopover'
import logo from '../assets/tubeghost-logo.png'

/**
 * Sidebar — the always-dark navigation rail (TubeGhost Design System). Real
 * routes (Profiles/Proxies/Extensions/Members/Roles/Settings) keep their
 * permission + plan-feature gating; the remaining DS items are placeholder
 * destinations (Stub pages) so the rail matches the design. UI only.
 */
export function Sidebar(): React.ReactElement {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const canCreate = useHasPermission('profiles.create')

  return (
    <aside className="sidebar shrink-0" style={{ width: 'var(--sidebar-w)' }}>
      <div className="sb-top">
        <div className="logo">
          <img src={logo} alt="TubeGhost" />
        </div>
        <div>
          <div className="brand-name">TubeGhost</div>
          <div className="brand-sub">Browser</div>
        </div>
      </div>

      <button
        className="sb-search"
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
      >
        <NavIcon name="search" size={15} />
        <span>Search everything</span>
        <kbd>⌘K</kbd>
      </button>

      {canCreate && (
        <button className="sb-create" onClick={() => navigate('/profiles/new')}>
          <NavIcon name="create" size={16} />
          Create profile
        </button>
      )}

      <SidebarNav pathname={pathname} navigate={navigate} />

      <SidebarUser />
    </aside>
  )
}

function SidebarNav({
  pathname,
  navigate
}: {
  pathname: string
  navigate: (to: string) => void
}): React.ReactElement {
  // Real routes are permission/plan gated. Hooks run unconditionally, in a
  // fixed order (never combined with `&&` inline — that would change hook
  // count between renders and trip React's hook invariant).
  const canViewProfiles = useHasPermission('profiles.view')
  const canViewProxies = useHasPermission('proxies.view')
  // Single "Members" entry opens the tabbed Team page (Members + Roles &
  // access); either permission grants access to at least one tab.
  const canViewMembers = useHasAnyPermission('members.view', 'roles.view')
  const canViewSettings = useHasAnyPermission(
    'workspace.view_settings',
    'workspace.edit_settings',
    'billing.view',
    'billing.manage'
  )
  // Extensions is permission-gated only — the nav item stays visible on plans
  // without the feature (the page itself is the upsell surface).
  const canViewExtensions = canViewProfiles
  const canViewAuth = useHasPermission('twofa.view')
  const canViewAutomations = useHasPermission('automations.view')

  const workspaceId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const proxyAlerts = useProxyAlerts(workspaceId)

  const active = (to: string): boolean => pathname === to || pathname.startsWith(to + '/')
  const go = (to: string) => () => navigate(to)

  return (
    <>
      <nav className="nav">
        {canViewProfiles && (
          <NavItem
            icon={<NavIcon name="profiles" />}
            label="Profiles"
            active={active('/profiles')}
            onClick={go('/profiles')}
          />
        )}

        <div className="nav-label">
          Resources
          <FeatureRequestButton />
        </div>
        {canViewProxies && (
          <div className="nav-buy-row">
            <NavItem
              icon={<NavIcon name="proxies" />}
              label="Proxies"
              alert={proxyAlerts > 0 ? String(proxyAlerts) : null}
              active={active('/proxies')}
              onClick={go('/proxies')}
              style={{ flex: 1 }}
            />
            <button
              className="nav-buy"
              title="Buy proxies — TubeProxies"
              onClick={go('/buy-proxies')}
            >
              <NavIcon name="briefcase" size={16} />
            </button>
          </div>
        )}
        {canViewAuth && (
          <NavItem
            icon={<NavIcon name="shield" />}
            label="Authenticator"
            active={active('/authenticator')}
            onClick={go('/authenticator')}
          />
        )}
        <div className="nav-buy-row">
          <NavItem
            icon={<NavIcon name="phone" />}
            label="Phone numbers"
            badge="New"
            active={active('/phone')}
            onClick={go('/phone')}
            style={{ flex: 1 }}
          />
          {/* Mirrors the Proxies buy shortcut. Pricing lives on the phone
              page itself rather than a separate route, so this navigates
              there with ?buy — the page scrolls to the price ladder, which
              is what distinguishes it from clicking the label. */}
          <button
            className="nav-buy"
            title="Buy phone numbers — TubeProxies"
            onClick={go('/phone?buy=1')}
          >
            <NavIcon name="briefcase" size={16} />
          </button>
        </div>
        {canViewExtensions && (
          <NavItem
            icon={<NavIcon name="extensions" />}
            label="Extensions"
            active={active('/extensions')}
            onClick={go('/extensions')}
          />
        )}

        <div className="nav-label">Automation</div>
        {canViewAutomations && (
          <NavItem
            icon={<NavIcon name="automation" />}
            label="Automations"
            live
            active={active('/automations')}
            onClick={go('/automations')}
          />
        )}

        {/* Members + Roles & access are one tabbed page now (/team/*), reached
            via a single "Members" entry. It stays active on both tabs. */}
        {canViewMembers && (
          <>
            <div className="nav-label">Teams</div>
            <NavItem
              icon={<NavIcon name="members" />}
              label="Members"
              active={active('/team')}
              onClick={go('/team/members')}
            />
          </>
        )}
      </nav>

      <div className="sb-links">
        {canViewSettings && (
          <NavItem
            icon={<NavIcon name="settings" />}
            label="Settings"
            active={active('/settings')}
            onClick={go('/settings')}
          />
        )}
        <NavItem
          icon={<NavIcon name="billing" />}
          label="Billing"
          active={active('/billing')}
          onClick={go('/billing')}
        />
      </div>
    </>
  )
}
