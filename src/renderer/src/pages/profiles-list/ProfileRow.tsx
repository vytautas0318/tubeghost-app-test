import * as React from 'react'
import { useRef, useState } from 'react'
import { Play } from 'lucide-react'
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
  onTagRenamedOrRemoved,
  selected,
  selectionActive,
  onSelectChange,
  allTags,
  groups,
  workspaceId,
  canEdit,
  onToast,
  onOpen,
  canLaunch
}: {
  profile: ViewProfile
  raw: ProfileRowType
  // Sequential position in the current (filtered/sorted/paged) view — shown in
  // the "#" column. The profile's own number is shown under its name instead.
  rowNumber: number
  // The workspace proxy matching this profile's host:port, if any — supplies
  // the country flag + location shown in the Proxy cell.
  proxyMeta?: ProxyRow | null
  // Called after a mutation. Passing the updated row lets the page patch it in
  // place (no refetch, no re-render of the whole table); omitting it forces a
  // full reload, for changes that touch more than this row.
  onChanged: (updated?: ProfileRowType) => void
  selected: boolean
  // Bubbled up from TagsCell so the page can keep an active tag filter in step
  // with a workspace-wide tag rename or delete.
  onTagRenamedOrRemoved?: (from: string, to: string | null) => void
  selectionActive: boolean
  // `range` is true when shift was held — the list extends the selection from
  // its anchor row instead of toggling this one.
  onSelectChange: (checked: boolean, range?: boolean) => void
  allTags: string[]
  groups: GroupRow[]
  workspaceId: string
  canEdit: boolean
  // Surfaces inline-edit failures (e.g. rename) as a page-level toast.
  onToast?: (kind: 'error' | 'info', text: string) => void
  // Open (launch) this profile. On the web build the page answers with the
  // "desktop app required" modal — see lib/desktop-app.ts.
  onOpen: () => void
  // 'profiles.launch'. Rendered disabled rather than hidden so the action's
  // existence — and why it's unavailable — stays discoverable.
  canLaunch: boolean
}): React.ReactElement {
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(p.name)
  // Shift state of the click that produced the pending change event.
  const shiftRef = useRef(false)

  const openNameEdit = (e: React.MouseEvent): void => {
    // stopPropagation FIRST: returning early left the click to bubble to the
    // row's selection-mode handler, so a view-only user clicking a profile
    // name toggled its checkbox instead of doing nothing.
    e.stopPropagation()
    if (!canEdit) return
    setNameVal(p.name)
    setEditingName(true)
  }
  const saveName = async (): Promise<void> => {
    const v = nameVal.trim()
    setEditingName(false)
    if (!v || v === p.name) return
    try {
      const updated = await updateProfile(raw.id, { name: v })
      onChanged(updated)
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
        (selectionActive ? 'cursor-pointer ' : '') +
        (selected ? 'bg-[var(--red-soft)] hover:bg-[var(--red-soft-2)]' : 'hover:bg-[var(--hover)]')
      }
      // Once something is selected the list is in selection mode, so a click
      // anywhere on the row toggles it -- hunting for the small checkbox every
      // time is tedious when picking several. Interactive descendants (inline
      // cells, Launch, the menu, the checkbox cell) already stop propagation
      // or are excluded here, so this only fires on dead space.
      onClick={
        selectionActive
          ? (e) => {
              const el = e.target as HTMLElement
              if (el.closest('button, a, input, select, textarea, [role="button"]')) return
              // A click that ends a text drag must not toggle: users still need
              // to select and copy an IP, a group name, a timestamp.
              if (!window.getSelection()?.isCollapsed) return
              onSelectChange(!selected, e.shiftKey)
            }
          : undefined
      }
    >
      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          // Shift is read off the click, not the change event: React's
          // ChangeEvent carries no modifier keys. Click fires first, so the ref
          // is already set by the time onChange reads it. Keyboard toggles
          // (space) fire change with no preceding click — the ref resets to
          // false below, so they stay plain toggles.
          // Shift+mousedown would otherwise smear a text selection across the
          // rows the user is range-selecting.
          onMouseDown={(e) => {
            if (e.shiftKey) e.preventDefault()
          }}
          onClick={(e) => {
            shiftRef.current = e.shiftKey
          }}
          onChange={(e) => {
            const range = shiftRef.current
            shiftRef.current = false
            onSelectChange(e.target.checked, range)
          }}
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
        <TagsCell
          raw={raw}
          allTags={allTags}
          canEdit={canEdit}
          onChanged={onChanged}
          onTagRenamedOrRemoved={onTagRenamedOrRemoved}
        />
      </td>
      <td className="px-3 py-3 text-[12.5px] text-[var(--t2)]">{p.lastOpened}</td>
      <td className="px-3 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex items-center gap-1.5 justify-end">
          <button
            onClick={onOpen}
            disabled={!canLaunch}
            className="row-open"
            title={canLaunch ? `Launch ${p.name}` : "You don't have permission to launch profiles"}
          >
            <Play className="w-3 h-3" fill="currentColor" />
            Launch
          </button>
          <RowMenu profile={raw} heldByOther={!!p.openByOther} onChange={onChanged} />
        </div>
      </td>
    </tr>
  )
}
