// Click-to-rename a profile in place.
//
// Extracted from ProfileRow so the card view can rename too — the two views
// were diverging, with the table editable inline and the card requiring a trip
// through the editor. Same save semantics either way: Enter or blur commits,
// Escape cancels, and an empty or unchanged name is a no-op rather than a
// write.

import * as React from 'react'
import { useState } from 'react'
import { updateProfile } from '@/lib/profiles'

export function InlineName({
  id,
  name,
  canEdit,
  className,
  onChanged,
  onToast
}: {
  id: string
  name: string
  canEdit: boolean
  // Lets each view keep its own typography (the card's name is a heading, the
  // row's is a 13.5px cell).
  className?: string
  onChanged: () => void
  onToast?: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)

  const open = (e: React.MouseEvent): void => {
    if (!canEdit) return
    // Cards and rows have their own click handlers (select, menus); renaming
    // must not also trigger those.
    e.stopPropagation()
    setVal(name)
    setEditing(true)
  }

  const save = async (): Promise<void> => {
    const v = val.trim()
    setEditing(false)
    if (!v || v === name) return
    try {
      await updateProfile(id, { name: v })
      onChanged()
    } catch (err) {
      onToast?.('error', `Rename failed: ${(err as Error).message}`)
    }
  }

  if (canEdit && editing) {
    return (
      <input
        className="name-edit-in"
        value={val}
        autoFocus
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          else if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <span
      className={(className ?? '') + (canEdit ? ' name-text' : ' truncate')}
      title={canEdit ? 'Click to rename' : undefined}
      onClick={open}
    >
      {name}
    </span>
  )
}
