// Inline edit row for a group in the "Group" filter dropdown — seeded from the
// group's current name/color, with explicit Cancel/Save (Enter saves, Escape
// cancels). Mirrors the Tag dropdown's TagEditRow. Reuses SmallColorPicker so
// the swatch UI matches GroupCreateRow.

import * as React from 'react'
import { useState } from 'react'
import { DEFAULT_GROUP_COLOR } from '@/lib/groups'
import { SmallColorPicker } from './GroupCreateRow'

export function GroupEditRow({
  initialName,
  initialColor,
  onSave,
  onCancel
}: {
  initialName: string
  initialColor: string
  onSave: (name: string, color: string) => Promise<void>
  onCancel: () => void
}): React.ReactElement {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState<string>(initialColor || DEFAULT_GROUP_COLOR)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onSave(trimmed, color)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <SmallColorPicker value={color} onChange={setColor} />
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          else if (e.key === 'Escape') onCancel()
        }}
        disabled={busy}
        className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-white dark:bg-night-base border border-[var(--line)] rounded text-[var(--t1)] focus:outline-none focus:ring-1 focus:ring-[var(--red)]/40"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        className="shrink-0 text-[11px] text-[var(--t3)] hover:text-[var(--t1)]"
      >
        Cancel
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void submit()}
        disabled={busy || !name.trim()}
        className="shrink-0 text-[11px] font-medium text-[var(--red)] disabled:opacity-40"
      >
        Save
      </button>
    </div>
  )
}
