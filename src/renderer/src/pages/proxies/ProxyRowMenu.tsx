// 3-dot row menu for the Proxies table. Permission-gated; mirrors the
// profile RowMenu pattern (outside-click + Escape to close).
//
// Actions:
//  - Edit / View details  → open the detail drawer
//  - Test connection      → run proxy-test (gated on proxies.test)
//  - Delete               → confirm + delete (gated on proxies.delete)

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Eye, MoreVertical, Trash2, Zap } from 'lucide-react'
import { useHasPermission } from '@/lib/permissions'
import type { ViewProxy } from './types'

export function ProxyRowMenu({
  proxy,
  onView,
  onTest,
  onDelete
}: {
  proxy: ViewProxy
  onView: () => void
  onTest: () => void
  onDelete: () => void
}): React.ReactElement {
  const canTest = useHasPermission('proxies.test')
  const canDelete = useHasPermission('proxies.delete')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="p-1 rounded hover:bg-[var(--hover)] text-[var(--t4)]"
        aria-label="Row actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 w-44 z-30 bg-[var(--panel)] border border-[var(--line)] rounded-lg shadow-xl py-1"
        >
          <Item
            icon={Eye}
            label="View details"
            onClick={() => {
              setOpen(false)
              onView()
            }}
          />
          {canTest && (
            <Item
              icon={Zap}
              label="Test connection"
              onClick={() => {
                setOpen(false)
                onTest()
              }}
            />
          )}
          {canDelete && (
            <>
              <div className="my-1 border-t border-[var(--line)]" />
              <Item
                icon={Trash2}
                label="Delete"
                danger
                disabled={proxy.profileCount > 0}
                hint={
                  proxy.profileCount > 0
                    ? `In use by ${proxy.profileCount} profile${proxy.profileCount === 1 ? '' : 's'}`
                    : undefined
                }
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Item({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
  hint
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  hint?: string
}): React.ReactElement {
  return (
    <button
      onClick={() => !disabled && onClick()}
      disabled={disabled}
      title={hint}
      className={
        'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ' +
        (disabled
          ? 'text-[var(--t4)] cursor-not-allowed'
          : danger
            ? 'text-[var(--red)] hover:bg-[var(--red-soft)]'
            : 'text-[var(--t1)] hover:bg-[var(--hover)]')
      }
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}
