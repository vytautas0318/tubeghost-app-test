// Right-click context menu for a group row in the GroupSidebar.
// Rename / Recolor / Delete. Pinned to a screen position.

import * as React from 'react'
import { useEffect, useRef } from 'react'
import { Pencil, Palette, Trash2 } from 'lucide-react'
import { PRESET_COLORS } from '@/lib/groups'

export interface GroupContextMenuProps {
  x: number
  y: number
  currentColor: string
  onRename: () => void
  onRecolor: (color: string) => void
  onDelete: () => void
  onClose: () => void
}

export function GroupContextMenu({
  x,
  y,
  currentColor,
  onRename,
  onRecolor,
  onDelete,
  onClose
}: GroupContextMenuProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 w-44 bg-[var(--panel)] border border-[var(--line)] rounded-lg shadow-xl py-1"
    >
      <button
        onClick={onRename}
        className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-[var(--t1)] hover:bg-[var(--hover)]"
      >
        <Pencil className="w-3.5 h-3.5" />
        Rename
      </button>
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-2 text-[11px] text-[var(--t3)] mb-1">
          <Palette className="w-3 h-3" />
          Recolor
        </div>
        <div className="flex flex-wrap gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onRecolor(c)}
              className={
                'w-4 h-4 rounded-full border border-black/10 dark:border-white/10 hover:ring-2 hover:ring-[var(--red)]/30' +
                (c.toLowerCase() === currentColor.toLowerCase() ? ' ring-2 ring-brand-red/50' : '')
              }
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>
      <div className="my-1 border-t border-[var(--line)]" />
      <button
        onClick={onDelete}
        className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-[var(--red)] hover:bg-[var(--red-soft)]"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
    </div>
  )
}
