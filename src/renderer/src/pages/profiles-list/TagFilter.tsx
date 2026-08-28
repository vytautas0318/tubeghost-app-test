// Toolbar "Tag" dropdown — filter the table by tag (multi-select) AND create a
// new workspace tag inline, mirroring the Group dropdown's "New group" flow.
// Sourced from the workspace tag registry (useWorkspaceTags) so a freshly-
// created tag appears immediately, even before it's on any profile.

import * as React from 'react'
import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { FilterChip } from './FilterChip'
import { TagCreateRow, TagEditRow } from './TagRows'
import { type TagRow } from '@tubeghost/ui'

export function TagFilterDropdown({
  tags,
  selected,
  colorFor,
  canCreate,
  canEdit,
  canDelete,
  onChange,
  onCreate,
  onEdit,
  onDelete
}: {
  tags: TagRow[]
  selected: string[]
  colorFor: (name: string) => string
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  onChange: (next: string[]) => void
  onCreate: (name: string, color: string) => Promise<void>
  onEdit: (id: string, name: string, color: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}): React.ReactElement {
  return (
    <FilterChip label="Tag" value={selected.length > 0 ? `${selected.length} selected` : null}>
      {() => (
        <TagMenu
          tags={tags}
          selected={selected}
          colorFor={colorFor}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          onChange={onChange}
          onCreate={onCreate}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </FilterChip>
  )
}

function TagMenu({
  tags,
  selected,
  colorFor,
  canCreate,
  canEdit,
  canDelete,
  onChange,
  onCreate,
  onEdit,
  onDelete
}: {
  tags: TagRow[]
  selected: string[]
  colorFor: (name: string) => string
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  onChange: (next: string[]) => void
  onCreate: (name: string, color: string) => Promise<void>
  onEdit: (id: string, name: string, color: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}): React.ReactElement {
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const toggle = (name: string): void =>
    onChange(selected.includes(name) ? selected.filter((x) => x !== name) : [...selected, name])

  const remove = async (t: TagRow): Promise<void> => {
    if (!window.confirm(`Delete tag "${t.name}"? It will be removed from all profiles.`)) return
    try {
      await onDelete(t.id)
    } catch (e) {
      window.alert(`Delete failed: ${(e as Error).message}`)
      return
    }
    if (selected.includes(t.name)) onChange(selected.filter((x) => x !== t.name))
  }

  const saveEdit = async (t: TagRow, name: string, color: string): Promise<void> => {
    try {
      await onEdit(t.id, name, color)
    } catch (e) {
      window.alert(`Rename failed: ${(e as Error).message}`)
      return
    }
    // The tag is referenced by name in the filter, so a rename must carry the
    // selection over to the new name.
    if (name !== t.name && selected.includes(t.name)) {
      onChange(selected.map((x) => (x === t.name ? name : x)))
    }
    setEditingId(null)
  }

  const create = async (name: string, color: string): Promise<void> => {
    // If it already exists, just select it. Otherwise create + select.
    if (!tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      try {
        await onCreate(name, color)
      } catch (e) {
        window.alert(`Create failed: ${(e as Error).message}`)
        return
      }
    }
    setCreating(false)
    if (!selected.includes(name)) onChange([...selected, name])
  }

  return (
    <div className="py-1 min-w-[210px]">
      {tags.length === 0 && !creating && (
        <div className="px-3 py-2 text-[11px] text-[var(--t3)]">No tags yet</div>
      )}
      {tags.length > 0 && (
        <div className="max-h-56 overflow-auto">
          {tags.map((t) =>
            editingId === t.id ? (
              <TagEditRow
                key={t.id}
                initialName={t.name}
                initialColor={t.color}
                onSave={(name, color) => saveEdit(t, name, color)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <label
                key={t.id}
                className="group flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--hover)] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(t.name)}
                  onChange={() => toggle(t.name)}
                  className="rounded"
                />
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: colorFor(t.name) }}
                />
                <span className="flex-1 min-w-0 truncate text-[var(--t1)]">{t.name}</span>
                {canEdit && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setEditingId(t.id)
                    }}
                    title={`Edit "${t.name}"`}
                    className="shrink-0 p-0.5 rounded text-[var(--t3)] opacity-0 group-hover:opacity-100 hover:text-[var(--t1)] hover:bg-[var(--hover)] focus:opacity-100"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void remove(t)
                    }}
                    title={`Delete "${t.name}"`}
                    className="shrink-0 p-0.5 rounded text-[var(--t3)] opacity-0 group-hover:opacity-100 hover:text-[var(--red)] hover:bg-[var(--hover)] focus:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </label>
            )
          )}
        </div>
      )}

      {canCreate && (
        <>
          <div className="my-1 border-t border-[var(--line-2)]" />
          {creating ? (
            <TagCreateRow onCreate={create} onCancel={() => setCreating(false)} />
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[var(--t3)] hover:text-[var(--red)] hover:bg-[var(--hover)]"
            >
              <Plus className="w-3.5 h-3.5" />
              New tag
            </button>
          )}
        </>
      )}
    </div>
  )
}
