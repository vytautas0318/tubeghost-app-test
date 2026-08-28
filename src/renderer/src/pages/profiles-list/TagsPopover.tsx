// The portalled panel for TagsCell: attached-tag chips (with inline edit),
// the search/add input, tag suggestions (each editable/deletable), and the
// "create with color" row. Presentational — all state + handlers come from
// TagsCell so this stays a pure view.

import { Badge, TagRow } from '@tubeghost/ui'
import * as React from 'react'
import { Plus, X, Pencil, Trash2 } from 'lucide-react'
import { ColorSwatches as Swatches } from '@/components/ColorSwatches'

const stop = (e: React.SyntheticEvent): void => e.stopPropagation()

export interface TagsPopoverProps {
  panelRef: React.RefObject<HTMLDivElement | null>
  style: React.CSSProperties
  tags: string[]
  suggestions: TagRow[]
  colorFor: (name: string) => string
  rowFor: (name: string) => { id: string; color: string } | null
  input: string
  setInput: (v: string) => void
  newColor: string
  setNewColor: (c: string) => void
  canCreateFromInput: boolean
  canTagEdit: boolean
  canTagDelete: boolean
  editingId: string | null
  editName: string
  setEditName: (v: string) => void
  editColor: string
  setEditColor: (c: string) => void
  onClose: () => void
  attach: (name: string) => void
  detach: (name: string) => void
  createAndAttach: () => void
  startEdit: (id: string, name: string, color: string) => void
  cancelEdit: () => void
  saveEdit: () => void
  removeTag: (id: string) => void
}

// Inline name + color editor, reused by the attached-chip editor and the
// suggestion-row editor.
function EditForm({
  name,
  setName,
  color,
  setColor,
  onCancel,
  onSave
}: {
  name: string
  setName: (v: string) => void
  color: string
  setColor: (c: string) => void
  onCancel: () => void
  onSave: () => void
}): React.ReactElement {
  return (
    <>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave()
          else if (e.key === 'Escape') onCancel()
        }}
        className="w-full mb-1.5 px-2 py-1 text-xs rounded border border-[var(--line)] bg-[var(--panel-2)] text-[var(--t1)] outline-none"
      />
      <div className="flex items-center justify-between">
        <Swatches value={color} onPick={setColor} />
        <div className="flex gap-1.5">
          <button className="text-[11px] text-[var(--t3)]" onClick={onCancel}>
            Cancel
          </button>
          <button className="text-[11px] font-medium text-[var(--red)]" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </>
  )
}

export function TagsPopover({
  panelRef,
  style,
  tags,
  suggestions,
  colorFor,
  rowFor,
  input,
  setInput,
  newColor,
  setNewColor,
  canCreateFromInput,
  canTagEdit,
  canTagDelete,
  editingId,
  editName,
  setEditName,
  editColor,
  setEditColor,
  onClose,
  attach,
  detach,
  createAndAttach,
  startEdit,
  cancelEdit,
  saveEdit,
  removeTag
}: TagsPopoverProps): React.ReactElement {
  const editingAttached = editingId != null && tags.some((t) => rowFor(t)?.id === editingId)

  return (
    <div
      ref={panelRef}
      style={style}
      onClick={stop}
      className="z-50 w-64 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] p-2"
    >
      {tags.length > 0 && (
        <div className="mb-2 pb-2 border-b border-[var(--line)] space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => {
              const row = rowFor(t)
              return (
                <Badge key={t} color={colorFor(t)}>
                  {t}
                  {canTagEdit && row && editingId !== row.id && (
                    <button
                      onClick={() => startEdit(row.id, t, row.color)}
                      className="opacity-60 hover:opacity-100 inline-flex"
                      title={`Edit ${t}`}
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  )}
                  <button
                    onClick={() => detach(t)}
                    className="opacity-60 hover:opacity-100 inline-flex"
                    title={`Remove ${t}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              )
            })}
          </div>
          {editingAttached && (
            <div className="px-0.5 pt-1">
              <EditForm
                name={editName}
                setName={setEditName}
                color={editColor}
                setColor={setEditColor}
                onCancel={cancelEdit}
                onSave={saveEdit}
              />
            </div>
          )}
        </div>
      )}

      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (canCreateFromInput) createAndAttach()
            else attach(input)
          } else if (e.key === 'Escape') onClose()
        }}
        placeholder="Search or add tag…"
        className="w-full px-2 py-1.5 text-xs bg-[var(--panel-2)] border border-[var(--line)] rounded-[var(--r-sm)] text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
      />

      <div className="mt-1.5 max-h-52 overflow-auto">
        {suggestions.length > 0 && (
          <div className="text-[9px] uppercase tracking-wider text-[var(--t3)] px-1.5 py-1 font-semibold">
            Tags
          </div>
        )}
        {suggestions.map((t) =>
          editingId === t.id ? (
            <div key={t.id} className="px-1.5 py-1.5">
              <EditForm
                name={editName}
                setName={setEditName}
                color={editColor}
                setColor={setEditColor}
                onCancel={cancelEdit}
                onSave={saveEdit}
              />
            </div>
          ) : (
            <div
              key={t.id}
              className="w-full px-1.5 py-1 text-xs rounded hover:bg-[var(--hover)] flex items-center justify-between gap-2 group/tag"
            >
              <button onClick={() => attach(t.name)} className="flex-1 text-left">
                <Badge color={t.color}>{t.name}</Badge>
              </button>
              {canTagEdit && (
                <button
                  className="opacity-0 group-hover/tag:opacity-100 text-[var(--t3)] hover:text-[var(--t1)]"
                  title="Edit tag"
                  onClick={() => startEdit(t.id, t.name, t.color)}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
              {canTagDelete && (
                <button
                  className="opacity-0 group-hover/tag:opacity-100 text-[var(--t3)] hover:text-[var(--red)]"
                  title={`Delete "${t.name}"`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete tag "${t.name}"? It will be removed from all profiles.`
                      )
                    )
                      removeTag(t.id)
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        )}
        {canCreateFromInput && (
          <div className="px-1.5 py-1.5 border-t border-[var(--line)] mt-1">
            <div className="flex items-center gap-1.5 text-xs text-[var(--t1)] mb-1.5">
              <Plus className="w-3 h-3 text-[var(--red)]" />
              Create “<span className="font-semibold">{input.trim()}</span>”
              <Badge color={newColor}>{input.trim()}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <Swatches value={newColor} onPick={setNewColor} />
              <button
                className="px-2 py-1 rounded text-[11px] font-medium text-[var(--red)] transition-colors hover:bg-[var(--red)] hover:text-white"
                onClick={() => createAndAttach()}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
