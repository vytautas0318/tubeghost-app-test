// Profile-scope picker for the builder trigger: All profiles / specific Groups
// / specific Profiles. Reuses the existing listGroups + listProfiles data; there
// was no shared multi-select component, so this is the canonical one for scope.

import * as React from 'react'
import { Select, Checkbox } from '@tubeghost/ui'
import type { GroupRow } from '@/lib/groups'
import type { ProfileRow } from '@/lib/profiles'
import type { ProfileScope } from '../../../../shared/automations/types'

export function ScopePicker({
  scope,
  groupIds,
  profileIds,
  groups,
  profiles,
  onChange
}: {
  scope: ProfileScope
  groupIds: string[]
  profileIds: string[]
  groups: GroupRow[]
  profiles: ProfileRow[]
  onChange: (next: { scope: ProfileScope; groupIds: string[]; profileIds: string[] }) => void
}): React.ReactElement {
  const setScope = (s: ProfileScope): void => onChange({ scope: s, groupIds, profileIds })
  const toggleGroup = (id: string): void =>
    onChange({
      scope,
      profileIds,
      groupIds: groupIds.includes(id) ? groupIds.filter((x) => x !== id) : [...groupIds, id]
    })
  const toggleProfile = (id: string): void =>
    onChange({
      scope,
      groupIds,
      profileIds: profileIds.includes(id) ? profileIds.filter((x) => x !== id) : [...profileIds, id]
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Select
        value={scope}
        onChange={(e) => setScope(e.target.value as ProfileScope)}
        style={{ minWidth: 0 }}
      >
        <option value="all">All profiles</option>
        <option value="groups">Specific groups</option>
        <option value="profiles">Specific profiles</option>
      </Select>

      {scope === 'groups' && (
        <div className="auto-scope-list">
          {groups.length === 0 && <div className="auto-scope-empty">No groups yet</div>}
          {groups.map((g) => (
            <label className="auto-scope-item" key={g.id}>
              <Checkbox checked={groupIds.includes(g.id)} onChange={() => toggleGroup(g.id)} />
              <span>{g.name}</span>
            </label>
          ))}
        </div>
      )}

      {scope === 'profiles' && (
        <div className="auto-scope-list">
          {profiles.length === 0 && <div className="auto-scope-empty">No profiles yet</div>}
          {profiles.map((p) => (
            <label className="auto-scope-item" key={p.id}>
              <Checkbox checked={profileIds.includes(p.id)} onChange={() => toggleProfile(p.id)} />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
