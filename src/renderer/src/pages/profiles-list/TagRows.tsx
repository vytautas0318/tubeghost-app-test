// Inline create/edit rows for the toolbar "Tag" dropdown (TagFilter.tsx).
// Split out of TagFilter.tsx to keep both files under the 250-line rule.
// Both rows share SwatchPicker — a compact popover color picker matching the
// TagManager recolor UI, but self-contained so it survives the FilterChip
// popover's outside-click handling (onMouseDown + preventDefault throughout).

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { TAG_PRESET_COLORS, DEFAULT_TAG_COLOR } from '@/lib/tags'

// Popover swatch picker triggered by a color dot. Shared by create + edit rows.
// Dismissal is a scoped document-mousedown-outside listener rather than a
// `fixed inset-0` backdrop — the backdrop overlays the row's own dot/input/
// Save/Cancel controls (z above them) and eats their clicks, so the picker
// couldn't be re-toggled and the row couldn't be saved while it was open.
function SwatchPicker({
  color,
  onPick
}: {
  color: string
  onPick: (c: string) => void
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
          // stopPropagation: picking a swatch unmounts the grid synchronously,
          // which detaches the clicked node from the DOM before the mousedown
          // reaches document-level outside-click handlers (FilterChip /
          // useAnchoredPopover). A detached target fails their `contains()`
          // check → they'd wrongly close the whole dropdown/edit row. Keep the
          // dot consistent so re-toggling behaves the same.
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="w-4 h-4 rounded-full border border-black/10 dark:border-white/10 hover:ring-2 hover:ring-[var(--red)]/30"
        style={{ backgroundColor: color }}
        title="Change color"
      />
      {open && (
        <div className="absolute z-20 mt-1 left-0 p-1.5 bg-[var(--panel)] border border-[var(--line)] rounded-lg shadow-lg flex flex-wrap gap-1 w-[132px]">
          {TAG_PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onPick(c)
                setOpen(false)
              }}
              className="w-4 h-4 rounded-full border border-black/10 dark:border-white/10 hover:ring-2 hover:ring-[var(--red)]/30 relative"
              style={{ backgroundColor: c }}
            >
              {c.toLowerCase() === color.toLowerCase() && (
                <Check className="w-2.5 h-2.5 text-white absolute inset-0 m-auto drop-shadow" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const rowInputCls =
  'flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-white dark:bg-night-base border border-[var(--line)] rounded text-[var(--t1)] focus:outline-none focus:ring-1 focus:ring-[var(--red)]/40'

export function TagCreateRow({
  onCreate,
  onCancel
}: {
  onCreate: (name: string, color: string) => Promise<void>
  onCancel: () => void
}): React.ReactElement {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(DEFAULT_TAG_COLOR)
  const [busy, setBusy] = useState(false)

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
      <SwatchPicker color={color} onPick={setColor} />
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          else if (e.key === 'Escape') onCancel()
        }}
        placeholder="Tag name…"
        disabled={busy}
        className={rowInputCls}
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

export function TagEditRow({
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
  const [color, setColor] = useState<string>(initialColor || DEFAULT_TAG_COLOR)
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
      <SwatchPicker color={color} onPick={setColor} />
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
        className={rowInputCls}
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
