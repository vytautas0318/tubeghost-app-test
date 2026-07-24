import * as React from 'react'
import { useState } from 'react'
import { RowMenu } from './RowMenu'
import { GroupCell, ProxyCell, TagsCell } from './InlineCells'
import { OsMark } from './osFlag'
import type { ViewProfile } from './types'
import type { ProxyRow } from '@/lib/proxies'
import { updateProfile, type ProfileRow as ProfileRowType } from '@/lib/profiles'
import type { GroupRow } from '@/lib/groups'

export function ProfileRow({
  profile: p,
  raw,
  rowNumber,
  proxyMeta,
  onChanged,
  selected,
  onSelectChange,
  allTags,
  groups,
  workspaceId,
  canEdit,
  onToast
}: {
  profile: ViewProfile
  raw: ProfileRowType
  // Sequential position in the current (filtered/sorted/paged) view — shown in
  // the "#" column. The profile's own number is shown under its name instead.
  rowNumber: number
  // The workspace proxy matching this profile's host:port, if any — supplies
  // the country flag + location shown in the Proxy cell.
  proxyMeta?: ProxyRow | null
  onChanged: () => void
  selected: boolean
  onSelectChange: (checked: boolean) => void
  allTags: string[]
  groups: GroupRow[]
  workspaceId: string
  canEdit: boolean
  // Surfaces inline-edit failures (e.g. rename) as a page-level toast.
  onToast?: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(p.name)

  const openNameEdit = (e: React.MouseEvent): void => {
    if (!canEdit) return
    e.stopPropagation()
    setNameVal(p.name)
    setEditingName(true)
  }
  const saveName = async (): Promise<void> => {
    const v = nameVal.trim()
    setEditingName(false)
    if (!v || v === p.name) return
    try {
      await updateProfile(raw.id, { name: v })
      onChanged()
    } catch (err) {
      onToast?.('error', `Rename failed: ${(err as Error).message}`)
    }
  }

  return (
    // The row itself is NOT a navigation target — clicking anywhere on it does
    // nothing. Edit is reached via the row's ⋮ menu → "Edit profile". Inline
    // cells (name/group/proxy/tags), the checkbox, Launch and the ⋮ menu handle
    // their own clicks.
    <tr
      className={
        'group text-[var(--t1)] transition-colors ' +
        (selected ? 'bg-[var(--red-soft)] hover:bg-[var(--red-soft-2)]' : 'hover:bg-[var(--hover)]')
      }
    >
      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectChange(e.target.checked)}
          className={
            'rounded accent-[var(--red)] cursor-pointer transition-opacity ' +
            (selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
          }
        />
      </td>
      <td className="px-3 py-3 mono text-[12.5px] text-[var(--t3)] tabular-nums">{rowNumber}</td>
      <td className="px-3 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {canEdit && editingName ? (
              <input
                className="name-edit-in"
                value={nameVal}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNameVal(e.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveName()
                  else if (e.key === 'Escape') setEditingName(false)
                }}
              />
            ) : (
              <span
                className={'font-[550] text-[13.5px] ' + (canEdit ? 'name-text' : 'truncate')}
                onClick={openNameEdit}
              >
                {p.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 mono text-[11.5px] text-[var(--t3)]">
            <OsMark platform={raw.platform} />
            {p.number != null ? p.number : '—'}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-[13px] text-[var(--t1)]">
        <GroupCell raw={raw} groups={groups} canEdit={canEdit} onChanged={onChanged} />
      </td>
      <td className="px-3 py-3 mono text-[12.5px] text-[var(--t1)]">
        <ProxyCell
          raw={raw}
          meta={proxyMeta ?? null}
          workspaceId={workspaceId}
          canEdit={canEdit}
          onChanged={onChanged}
        />
      </td>
      <td className="px-3 py-3">
        <TagsCell raw={raw} allTags={allTags} canEdit={canEdit} onChanged={onChanged} />
      </td>
      <td className="px-3 py-3 text-[12.5px] text-[var(--t2)]">{p.lastOpened}</td>
      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <RowMenu profile={raw} heldByOther={!!p.openByOther} onChange={onChanged} />
      </td>
    </tr>
  )
}
