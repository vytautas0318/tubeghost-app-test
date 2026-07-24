import * as React from 'react'
import { Search, X, Check, Plus } from 'lucide-react'
import { Badge, PlatformIcon } from '@/components/ui'
import { TAG_TONES, type PhoneNum, type ProfileOpt, type Tag } from './phoneData'

// Profile-search popover anchored under a number's "Linked profile" cell.
// `options` are the workspace's real profiles (fetched by the page).
export function AssignPopover({
  num,
  options,
  x,
  y,
  aq,
  setAq,
  onPick
}: {
  num: PhoneNum
  options: ProfileOpt[]
  x: number
  y: number
  aq: string
  setAq: (v: string) => void
  onPick: (opt: ProfileOpt | null) => void
}): React.ReactElement {
  const q2 = aq.trim().toLowerCase()
  const matches = options.filter((o) => !q2 || o.name.toLowerCase().includes(q2))
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
        {num.profile !== 'Unassigned' && (
          <div className="grp-opt" onClick={() => onPick(null)}>
            <X size={15} />
            Unassign
          </div>
        )}
        {matches.map((o) => (
          <div
            key={o.name}
            className={'grp-opt px-opt' + (num.profile === o.name ? ' on' : '')}
            onClick={() => onPick(o)}
          >
            {o.pl && <PlatformIcon platform={o.pl} size={20} />}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {o.name}
            </span>
            {num.profile === o.name && (
              <span className="grp-check">
                <Check size={14} />
              </span>
            )}
          </div>
        ))}
        {!matches.length && (
          <div className="pop-empty">{q2 ? 'No matching profile' : 'No profiles yet'}</div>
        )}
      </div>
    </div>
  )
}

// Tag multi-select popover anchored under a number's "Tags" cell.
export function TagPopover({
  num,
  x,
  y,
  onToggle
}: {
  num: PhoneNum
  x: number
  y: number
  onToggle: (t: Tag) => void
}): React.ReactElement {
  return (
    <div
      className="grp-pop"
      style={{ left: x + 'px', top: y + 'px', width: '200px' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grp-pop-h">Tags</div>
      <div className="tag-pop-list">
        {TAG_TONES.map((t) => {
          const on = (num.tags || []).some(([, l]) => l === t[1])
          return (
            <div key={t[1]} className={'tag-opt' + (on ? ' on' : '')} onClick={() => onToggle(t)}>
              <Badge tone={t[0]}>{t[1]}</Badge>
              <span className="tag-check">{on ? <Check size={13} /> : <Plus size={13} />}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
