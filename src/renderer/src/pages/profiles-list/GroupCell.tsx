// Inline "Group" cell for the Profiles list. Clicking it opens a "Move to
// group" popover: a search box to filter groups, the group list (pick to
// reassign this profile), plus per-group edit (inline rename/recolor) and
// delete-with-confirm — mirroring the toolbar Group filter dropdown. Group
// management perms (groups.edit / groups.delete) are read here directly so the
// row doesn't have to thread them; profiles.edit still gates whether the cell
// is interactive at all.

import * as React from 'react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderInput, Pencil, Trash2 } from 'lucide-react'
import { updateProfile, type ProfileRow as ProfileRowType } from '@/lib/profiles'
import { updateGroup, deleteGroup, type GroupRow } from '@/lib/groups'
import { useHasPermission } from '@/lib/permissions'
import { useAnchoredPopover } from './useAnchoredPopover'
import { GroupEditRow } from './GroupEditRow'

const stop = (e: React.MouseEvent | React.SyntheticEvent): void => e.stopPropagation()

export function GroupCell({
  raw,
  groups,
  canEdit,
  onChanged
}: {
  raw: ProfileRowType
  groups: GroupRow[]
  canEdit: boolean
  // With an updated row → patched in place. Without → full refetch, which is
  // what group rename/delete need (they change every row's group label).
  onChanged: (updated?: ProfileRowType) => void
}): React.ReactElement {
  const canGroupEdit = useHasPermission('groups.edit')
  const canGroupDelete = useHasPermission('groups.delete')

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const { triggerRef, panelRef, style } = useAnchoredPopover(open, setOpen, 224)

  const current = groups.find((g) => g.id === raw.group_id) ?? null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups
  }, [groups, search])

  const setGroup = async (groupId: string | null): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const updated = await updateProfile(raw.id, { group_id: groupId })
      setOpen(false)
      onChanged(updated)
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async (g: GroupRow, name: string, color: string): Promise<void> => {
    try {
      await updateGroup(g.id, { name, color })
      setEditingId(null)
      onChanged()
    } catch (e) {
      window.alert(`Rename failed: ${(e as Error).message}`)
    }
  }

  const del = async (g: GroupRow): Promise<void> => {
    if (!window.confirm(`Delete group "${g.name}"? Its profiles will become ungrouped.`)) return
    try {
      await deleteGroup(g.id)
      onChanged()
    } catch (e) {
      window.alert(`Delete failed: ${(e as Error).message}`)
    }
  }

  if (!canEdit) {
    return <span className="text-[13px] text-[var(--t1)]">{current?.name ?? '—'}</span>
  }

  return (
    <div className="relative" onClick={stop}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="text-[13px] text-left rounded px-1.5 -mx-1.5 py-0.5 transition-colors inline-flex items-center gap-1.5 min-w-[60px] group-hover:hover:bg-[var(--hover)]"
      >
        {current ? (
          <>
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: current.color ?? '#6366f1' }}
            />
            <span className="text-[var(--t1)] font-medium">{current.name}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--t4)] hover:text-[var(--red)] opacity-0 group-hover:opacity-100 transition-opacity">
            <FolderInput className="w-3 h-3" />
            Set group
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            onClick={stop}
            className="z-50 w-56 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] py-1"
          >
            <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--t3)]">
              Move to group
            </div>
            <div className="px-2 pb-1.5">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
                placeholder="Search groups…"
                className="w-full px-2 py-1 text-xs bg-[var(--panel-2)] border border-[var(--line)] rounded-[var(--r-sm)] text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
              />
            </div>
            <div className="max-h-56 overflow-auto">
              <button
                onClick={() => void setGroup(null)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--hover)] flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--t4)] shrink-0" />
                <span className="text-[var(--t3)] italic">— Ungrouped —</span>
              </button>
              {filtered.length > 0 && <div className="my-1 border-t border-[var(--line-2)]" />}
              {filtered.map((g) =>
                editingId === g.id ? (
                  <GroupEditRow
                    key={g.id}
                    initialName={g.name}
                    initialColor={g.color ?? ''}
                    onSave={(name, color) => saveEdit(g, name, color)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div
                    key={g.id}
                    className="group/gr w-full px-3 py-1.5 text-xs hover:bg-[var(--hover)] flex items-center gap-2"
                  >
                    <button
                      onClick={() => void setGroup(g.id)}
                      className="flex-1 min-w-0 text-left flex items-center gap-2"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: g.color ?? '#6366f1' }}
                      />
                      <span className="text-[var(--t1)] truncate">{g.name}</span>
                    </button>
                    {g.id === raw.group_id && (
                      <span className="text-[10px] text-[var(--red)] font-semibold">✓</span>
                    )}
                    {canGroupEdit && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingId(g.id)
                        }}
                        className="opacity-0 group-hover/gr:opacity-100 p-0.5 rounded text-[var(--t4)] hover:text-[var(--t1)] transition-opacity"
                        title={`Edit "${g.name}"`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    {canGroupDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void del(g)
                        }}
                        className="opacity-0 group-hover/gr:opacity-100 p-0.5 rounded text-[var(--t4)] hover:text-[var(--red)] transition-opacity"
                        title={`Delete "${g.name}"`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )
              )}
              {filtered.length === 0 && search.trim() && (
                <div className="px-3 py-2 text-[11px] text-[var(--t3)]">No groups match</div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
