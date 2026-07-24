import * as React from 'react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SegmentedControl } from '@/components/ui'
import { MembersBody } from '../members/MembersBody'
import { RolesBody } from '../roles-access/RolesBody'
import { TeamHeaderContext, type TeamHeaderContent } from './TeamHeaderContext'

type Tab = 'members' | 'roles'

const TABS = [
  { value: 'members' as const, label: 'Members' },
  { value: 'roles' as const, label: 'Roles & access' }
]

const PATH: Record<Tab, string> = {
  members: '/team/members',
  roles: '/team/roles'
}

function tabFromPath(pathname: string): Tab {
  return pathname.startsWith('/team/roles') ? 'roles' : 'members'
}

/**
 * TeamPage — shared tabbed shell for the two former sidebar destinations
 * (Members + Roles & access), now a single "Members" sidebar entry with a
 * horizontal tab switcher. The active tab is driven by the route
 * (/team/members | /team/roles) so both views stay independently routable and
 * deep-linkable; switching tabs navigates. Each tab's body (MembersBody /
 * RolesBody) is the untouched former page content; the tab-specific subtitle
 * and action button are pushed up into this header via TeamHeaderContext.
 */
export function TeamPage(): React.ReactElement {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const tab = tabFromPath(pathname)

  // The active body registers its subtitle + action button here.
  const [header, setHeader] = useState<TeamHeaderContent | null>(null)

  const go = (t: Tab): void => {
    if (t !== tab) navigate(PATH[t])
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Members</h1>
            {header?.subtitle != null && <p>{header.subtitle}</p>}
          </div>
          <div className="phead-actions" style={{ alignItems: 'center' }}>
            {header?.action}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <SegmentedControl<Tab> options={TABS} value={tab} onChange={go} />
        </div>

        <TeamHeaderContext.Provider value={setHeader}>
          {tab === 'members' ? <MembersBody /> : <RolesBody />}
        </TeamHeaderContext.Provider>
      </div>
    </div>
  )
}
