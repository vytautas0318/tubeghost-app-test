import * as React from 'react'
import { Search, X, Check } from 'lucide-react'

export interface ProfileOpt {
  id: string
  name: string
}

// Profile-search popover anchored under a token's foot "profile" chip.
export function AssignPopover({
  profiles,
  assignedId,
  x,
  y,
  aq,
  setAq,
  onPick
}: {
  profiles: ProfileOpt[]
  assignedId: string | null
  x: number
  y: number
  aq: string
  setAq: (v: string) => void
  onPick: (id: string | null) => void
}): React.ReactElement {
  const q2 = aq.trim().toLowerCase()
  const matches = profiles.filter((p) => !q2 || p.name.toLowerCase().includes(q2))
  return (
    <div
      className="grp-pop"
      style={{ left: x + 'px', top: y + 'px', width: '250px' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pop-search">
        <Search size={14} />
        <input
          autoFocus
          placeholder="Search profiles…"
          value={aq}
          onChange={(e) => setAq(e.target.value)}
        />
      </div>
      <div className="grp-pop-list">
        {assignedId && (
          <div className="grp-opt" onClick={() => onPick(null)}>
            <X size={15} />
            Unassign
          </div>
        )}
        {matches.map((p) => (
          <div
            key={p.id}
            className={'grp-opt' + (assignedId === p.id ? ' on' : '')}
            onClick={() => onPick(p.id)}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {p.name}
            </span>
            {assignedId === p.id && (
              <span className="grp-check">
                <Check size={14} />
              </span>
            )}
          </div>
        ))}
        {q2 && !matches.length && <div className="pop-empty">No matching profile</div>}
      </div>
    </div>
  )
}
