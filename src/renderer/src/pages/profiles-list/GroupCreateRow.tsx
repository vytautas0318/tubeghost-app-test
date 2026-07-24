// Inline "+ New group" row inside the GroupSidebar. Toggle on the
// "+ New group" button reveals a name input + color dot; Enter creates,
// Escape cancels.

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { DEFAULT_GROUP_COLOR, PRESET_COLORS } from '@/lib/groups'

export function GroupCreateRow({
  onCreate,
  onCancel
}: {
  onCreate: (name: string, color: string) => Promise<void>
  onCancel: () => void
}): React.ReactElement {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(DEFAULT_GROUP_COLOR)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onCreate(trimmed, color)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <SmallColorPicker value={color} onChange={setColor} />
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          else if (e.key === 'Escape') onCancel()
        }}
        placeholder="Group name…"
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

export function SmallColorPicker({
  value,
  onChange
}: {
  value: string
  onChange: (color: string) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onMouseDown={(e) => {
          // Prevent input blur cancelling the create row when clicking the swatch.
          // stopPropagation: see TagRows SwatchPicker — picking a swatch unmounts
          // the grid synchronously, detaching the target before the mousedown
          // reaches document-level outside-click handlers, which would then
          // wrongly close the whole dropdown/edit row.
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="w-4 h-4 rounded-full border border-black/10 dark:border-white/10 hover:ring-2 hover:ring-[var(--red)]/30"
        style={{ backgroundColor: value }}
        title="Change color"
      />
      {open && (
        // No `fixed inset-0` backdrop — it would overlay the row's own dot /
        // input / Save / Cancel and eat their clicks. Dismiss via the scoped
        // document-mousedown-outside listener above.
        <div className="absolute z-20 mt-1 left-0 p-1.5 bg-[var(--panel)] border border-[var(--line)] rounded-lg shadow-lg flex gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(c)
                setOpen(false)
              }}
              className="w-4 h-4 rounded-full border border-black/10 dark:border-white/10 hover:ring-2 hover:ring-[var(--red)]/30 relative"
              style={{ backgroundColor: c }}
              title={c}
            >
              {c.toLowerCase() === value.toLowerCase() && (
                <Check className="w-2.5 h-2.5 text-white absolute inset-0 m-auto drop-shadow" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
