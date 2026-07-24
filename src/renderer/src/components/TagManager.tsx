import * as React from 'react'
import { useState } from 'react'
import { Check, Plus, Palette, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui'
import { DEFAULT_TAG_COLOR, type TagRow } from '@/lib/tags'
import { ColorSwatches as Swatches } from '@/components/ColorSwatches'

// Shared tag popover used by Profiles and Authenticator. Lists workspace tags
// (toggle to attach/detach on the current item), lets the user CREATE a new tag
// with a chosen color, and EDIT an existing tag's name/color. Colors come from
// the swatch palette (matches the Groups recolor UI).

export function TagManager({
  tags,
  attached,
  canManage,
  x,
  y,
  onToggle,
  onCreate,
  onEdit,
  onDelete
}: {
  tags: TagRow[]
  attached: string[] // tag names on the current item
  canManage: boolean // gate create/edit/delete (tags.create/edit/delete)
  x?: number
  y?: number
  onToggle: (name: string) => void
  onCreate: (name: string, color: string) => void
  onEdit: (id: string, name: string, color: string) => void
  onDelete: (id: string) => void
}): React.ReactElement {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(DEFAULT_TAG_COLOR)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<string>(DEFAULT_TAG_COLOR)

  const isOn = (name: string): boolean =>
    attached.some((a) => a.trim().toLowerCase() === name.trim().toLowerCase())

  const startEdit = (t: TagRow): void => {
    setEditing(t.id)
    setEditName(t.name)
    setEditColor(t.color)
  }
  const saveEdit = (): void => {
    if (editing && editName.trim()) onEdit(editing, editName.trim(), editColor)
    setEditing(null)
  }
  const create = (): void => {
    const n = newName.trim()
    if (!n) return
    onCreate(n, newColor)
    setNewName('')
    setNewColor(DEFAULT_TAG_COLOR)
  }

  return (
    <div
      className="grp-pop"
      style={{
        width: '236px',
        ...(x != null ? { left: x + 'px' } : {}),
        ...(y != null ? { top: y + 'px' } : {})
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grp-pop-h">Tags</div>
      <div className="tag-pop-list">
        {tags.map((t) =>
          editing === t.id ? (
            <div key={t.id} className="px-2 py-1.5">
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                className="w-full mb-1.5 px-2 py-1 text-xs rounded border border-[var(--line)] bg-[var(--panel-2)] text-[var(--t1)] outline-none"
              />
              <Swatches value={editColor} onPick={setEditColor} />
              <div className="flex justify-end gap-1.5 mt-1.5">
                <button
                  className="text-[11px] text-[var(--t3)] hover:text-[var(--t1)]"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button className="text-[11px] font-medium text-[var(--red)]" onClick={saveEdit}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div key={t.id} className={'tag-opt' + (isOn(t.name) ? ' on' : '')}>
              <span className="flex-1 cursor-pointer" onClick={() => onToggle(t.name)}>
                <Badge color={t.color}>{t.name}</Badge>
              </span>
              {canManage && (
                <>
                  <button className="tag-mini" title="Edit" onClick={() => startEdit(t)}>
                    <Pencil size={12} />
                  </button>
                  <button className="tag-mini" title="Delete" onClick={() => onDelete(t.id)}>
                    <Trash2 size={12} />
                  </button>
                </>
              )}
              <span className="tag-check" onClick={() => onToggle(t.name)}>
                {isOn(t.name) ? <Check size={13} /> : <Plus size={13} />}
              </span>
            </div>
          )
        )}
        {tags.length === 0 && <div className="pop-empty">No tags yet</div>}
      </div>

      {canManage && (
        <div className="px-2 py-2 border-t border-[var(--line)]">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--t3)] mb-1">
            <Palette size={12} />
            New tag
          </div>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="Tag name…"
            className="w-full mb-1.5 px-2 py-1 text-xs rounded border border-[var(--line)] bg-[var(--panel-2)] text-[var(--t1)] outline-none"
          />
          <div className="flex items-center justify-between">
            <Swatches value={newColor} onPick={setNewColor} />
            <button
              disabled={!newName.trim()}
              onClick={create}
              className="text-[11px] font-medium text-[var(--red)] disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
