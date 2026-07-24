import * as React from 'react'
import { MoreVertical, Tag, Pin } from 'lucide-react'
import { Badge, Toggle } from '@/components/ui'
import { NavIcon } from '@/components/sidebar/navIcons'
import type { ExtensionWithAssignment } from '@/lib/extensions'
import type { GroupRow } from '@/lib/groups'
import { ExtTile } from './ExtTile'
import { scopeMeta, assignmentSummary, scopeIconKind } from './extView'

function ScopeIcon({ ext }: { ext: ExtensionWithAssignment }): React.ReactElement {
  const kind = scopeIconKind(ext)
  if (kind === 'group') return <Tag size={16} />
  if (kind === 'manual') return <Pin size={16} />
  return <NavIcon name="profiles" size={16} />
}

// One installed-extension card: icon + name/publisher/version, ⋮ menu trigger,
// category chip + permission-scope badge, assignment summary + enable toggle.
export function ExtCard({
  ext,
  groups,
  canToggle,
  onToggle,
  onOpenMenu
}: {
  ext: ExtensionWithAssignment
  groups: GroupRow[]
  canToggle: boolean
  onToggle: (next: boolean) => void
  onOpenMenu: (rect: DOMRect) => void
}): React.ReactElement {
  const scope = scopeMeta(ext.permission_scope)
  return (
    <div className="ext-card">
      <div className="ext-card-top">
        <ExtTile name={ext.name} iconDataUrl={ext.icon_data_url} />
        <div className="ext-id">
          <div className="ext-name">{ext.name}</div>
          <div className="ext-dev">
            {(ext.publisher || 'Unknown') + ' · v' + (ext.version || '0.0.0')}
          </div>
        </div>
        <div
          className="ext-kebab"
          onClick={(ev) => {
            ev.stopPropagation()
            onOpenMenu(ev.currentTarget.getBoundingClientRect())
          }}
        >
          <MoreVertical size={16} />
        </div>
      </div>

      <div className="ext-meta">
        <Badge tone="neutral">{ext.category || 'Utility'}</Badge>
        <span className="ext-perm" title="Permission scope">
          <span className="ext-perm-dot" style={{ background: scope.color }} />
          {scope.label}
        </span>
      </div>

      <div className="ext-foot">
        <div className="ext-scope">
          <span className="ext-scope-ic">
            <ScopeIcon ext={ext} />
          </span>
          <span className="ext-scope-txt">{assignmentSummary(ext, groups)}</span>
        </div>
        <Toggle
          checked={ext.enabled}
          disabled={!canToggle}
          onChange={(next) => {
            if (canToggle) onToggle(next)
          }}
        />
      </div>
    </div>
  )
}
