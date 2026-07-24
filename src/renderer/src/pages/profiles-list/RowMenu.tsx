// 3-dot row menu for the profiles list. Permission-gated; uses
// outside-click + Escape to close. Lives in its own file so the row
// stays under the size cap.

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Download, MoreVertical, Pencil, Trash2, Unlock } from 'lucide-react'
import { useHasPermission } from '@/lib/permissions'
import { deleteProfile, duplicateProfile, exportProfile, type ProfileRow } from '@/lib/profiles'
import { forceReleaseProfileLock } from '@/lib/profile-locks'

export function RowMenu({
  profile,
  heldByOther,
  onChange
}: {
  profile: ProfileRow
  heldByOther: boolean
  onChange: () => void
}): React.ReactElement {
  const navigate = useNavigate()
  const canEdit = useHasPermission('profiles.edit')
  const canDelete = useHasPermission('profiles.delete')
  const canForce = useHasPermission('profiles.force_unlock')

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
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

  const onEdit = (): void => {
    setOpen(false)
    navigate(`/profiles/${profile.id}`)
  }

  const onExport = async (): Promise<void> => {
    setOpen(false)
    try {
      const json = await exportProfile(profile.id)
      // Trigger a download via a hidden anchor — works in Electron
      // renderer and matches what users expect.
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${profile.name.replace(/[^a-z0-9-_ ]/gi, '_')}.tubeproxies-profile.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      window.alert(`Export failed: ${(e as Error).message}`)
    }
  }

  const onDuplicate = async (): Promise<void> => {
    setOpen(false)
    try {
      await duplicateProfile(profile.id)
      onChange()
    } catch (e) {
      window.alert(`Duplicate failed: ${(e as Error).message}`)
    }
  }

  const onDelete = async (): Promise<void> => {
    setOpen(false)
    if (!window.confirm(`Delete profile "${profile.name}"? This cannot be undone.`)) return
    try {
      await deleteProfile(profile.id)
      onChange()
    } catch (e) {
      window.alert(`Delete failed: ${(e as Error).message}`)
    }
  }

  const onForce = async (): Promise<void> => {
    setOpen(false)
    if (!window.confirm(`Force-release the lock on "${profile.name}"?`)) return
    try {
      await forceReleaseProfileLock(profile.id)
      onChange()
    } catch (e) {
      window.alert(`Force unlock failed: ${(e as Error).message}`)
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={
          'w-7 h-7 grid place-items-center rounded-[7px] hover:bg-[var(--hover)] text-[var(--t3)] hover:text-[var(--t1)] transition-all ' +
          (open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
        }
        aria-label="Row actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 w-44 z-30 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] py-1"
        >
          <MenuItem icon={Pencil} label="Edit profile" onClick={onEdit} />
          {canEdit && <MenuItem icon={Copy} label="Duplicate" onClick={onDuplicate} />}
          <MenuItem icon={Download} label="Export" onClick={onExport} />
          {canForce && heldByOther && (
            <MenuItem icon={Unlock} label="Force unlock" onClick={onForce} />
          )}
          {canDelete && (
            <>
              <div className="my-1 border-t border-[var(--line-2)]" />
              <MenuItem icon={Trash2} label="Delete" onClick={onDelete} danger />
            </>
          )}
          {!canEdit && !canDelete && !(canForce && heldByOther) && (
            <div className="px-3 py-1.5 text-[11px] text-[var(--t3)]">No actions available</div>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void | Promise<void>
  danger?: boolean
}): React.ReactElement {
  return (
    <button
      onClick={() => void onClick()}
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
        danger
          ? 'text-[var(--red)] hover:bg-[var(--red-soft)]'
          : 'text-[var(--t1)] hover:bg-[var(--hover)]'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}
