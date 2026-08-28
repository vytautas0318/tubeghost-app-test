// Single item row inside the GroupSidebar (folder, "All profiles",
// "Ungrouped"). Handles drag-over highlight + active state. Splits out
// the inline rename row used while editing a group's name.

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { GroupFilter } from './groupFilterType'

export function GroupItem({
  id,
  label,
  icon: Icon,
  color,
  count,
  collapsed,
  active,
  hovered,
  onChange,
  onDrop,
  setHover,
  onContextMenu
}: {
  id: GroupFilter
  label: string
  icon: React.ComponentType<{ className?: string }>
  color?: string
  count?: number
  collapsed: boolean
  active: boolean
  hovered: boolean
  onChange: (f: GroupFilter) => void
  onDrop: (target: GroupFilter, e: React.DragEvent) => void | Promise<void>
  setHover: (f: GroupFilter | null) => void
  onContextMenu?: (e: React.MouseEvent) => void
}): React.ReactElement {
  return (
    <li>
      <button
        onClick={() => onChange(id)}
        onContextMenu={onContextMenu}
        onDragOver={(e) => {
          e.preventDefault()
          setHover(id)
        }}
        onDragLeave={() => setHover(null)}
        onDrop={(e) => void onDrop(id, e)}
        title={collapsed ? `${label}${count != null ? ` (${count})` : ''}` : undefined}
        className={
          'w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors text-left group ' +
          (active
            ? 'bg-[var(--red-soft)] text-[var(--red)]'
            : 'text-[var(--t2)] hover:bg-[var(--hover)] hover:text-[var(--t1)] dark:hover:text-night-text') +
          (hovered ? ' ring-2 ring-brand-red/40' : '') +
          (collapsed ? ' justify-center' : '')
        }
      >
        <span className={'flex items-center gap-2.5' + (collapsed ? '' : ' min-w-0')}>
          <span style={color ? { color } : undefined} className="inline-flex shrink-0">
            <Icon className="w-[18px] h-[18px]" />
          </span>
          {!collapsed && (
            <span className={'text-sm truncate ' + (active ? 'font-medium' : 'font-medium')}>
              {label}
            </span>
          )}
        </span>
        {!collapsed && count != null && (
          <span
            className={
              'text-xs font-medium px-1.5 rounded ' +
              (active ? 'text-[var(--red)]' : 'text-[var(--t4)]')
            }
          >
            {count}
          </span>
        )}
      </button>
    </li>
  )
}

export function GroupRenameRow({
  initial,
  color,
  onSubmit,
  onCancel
}: {
  initial: string
  color: string
  onSubmit: (name: string) => void
  onCancel: () => void
}): React.ReactElement {
  const [name, setName] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ backgroundColor: color }} />
      <input
        ref={ref}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(name)
          else if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => onSubmit(name)}
        className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-white dark:bg-night-base border border-[var(--line)] rounded text-[var(--t1)] focus:outline-none focus:ring-1 focus:ring-[var(--red)]/40"
      />
    </div>
  )
}
