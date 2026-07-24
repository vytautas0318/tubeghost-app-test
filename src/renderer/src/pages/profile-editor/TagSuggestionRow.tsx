// One multi-select row in the profile-editor Tags dropdown: checkbox + color
// dot + tag name, with hover-revealed edit (pencil) and delete (trash) actions.
// Matches the Profiles list-page Tag filter's per-tag row.

import * as React from 'react'
import { Pencil, Trash2 } from 'lucide-react'

export function TagSuggestionRow({
  name,
  color,
  checked,
  canEdit,
  canDelete,
  onToggle,
  onEdit,
  onDelete
}: {
  name: string
  color: string
  checked: boolean
  canEdit: boolean
  canDelete: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}): React.ReactElement {
  return (
    <label className="group/tr flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--hover)] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onToggle} className="rounded" />
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="flex-1 min-w-0 truncate text-[var(--t1)]">{name}</span>
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
            onEdit()
          }}
          className="shrink-0 p-0.5 rounded text-[var(--t3)] opacity-0 group-hover/tr:opacity-100 hover:text-[var(--t1)] hover:bg-[var(--hover)] focus:opacity-100"
          title={`Edit "${name}"`}
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
            onDelete()
          }}
          className="shrink-0 p-0.5 rounded text-[var(--t3)] opacity-0 group-hover/tr:opacity-100 hover:text-[var(--red)] hover:bg-[var(--hover)] focus:opacity-100"
          title={`Delete "${name}"`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </label>
  )
}
