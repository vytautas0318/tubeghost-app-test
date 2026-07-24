// Single-select "Group" dropdown for the profile editor's General tab.
// Full parity with the Profiles list-page Group filter: color dots, inline
// "New group" creation, plus per-group inline edit (pencil) and delete (trash).
// Single-group semantics: the value is a group id or null ("No group"), not the
// list filter's all/ungrouped modes.

import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { createGroup, deleteGroup, listGroups, updateGroup, type GroupRow } from '@/lib/groups'
import { useHasPermission } from '@/lib/permissions'
import { GroupCreateRow } from '../profiles-list/GroupCreateRow'
import { GroupEditRow } from '../profiles-list/GroupEditRow'

export function GroupSelect({
  workspaceId,
  value,
  onChange
}: {
  workspaceId: string | null
  value: string | null
  onChange: (groupId: string | null) => void
}): React.ReactElement {
  const canManage = useHasPermission('groups.create')
  const canEdit = useHasPermission('groups.edit')
  const canDelete = useHasPermission('groups.create')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const reload = useCallback((): void => {
    if (!workspaceId) return
    listGroups(workspaceId)
      .then(setGroups)
      .catch(() => undefined)
  }, [workspaceId])

  useEffect(() => {
    reload()
  }, [reload])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selected = value ? (groups.find((g) => g.id === value) ?? null) : null

  const create = async (name: string, color: string): Promise<void> => {
    if (!workspaceId) return
    try {
      const g = await createGroup(workspaceId, name, color)
      setCreating(false)
      reload()
      onChange(g.id)
      setOpen(false)
    } catch (e) {
      window.alert(`Create failed: ${(e as Error).message}`)
    }
  }

  const saveEdit = async (g: GroupRow, name: string, color: string): Promise<void> => {
    try {
      await updateGroup(g.id, { name, color })
      setEditingId(null)
      reload()
    } catch (e) {
      window.alert(`Rename failed: ${(e as Error).message}`)
    }
  }

  const del = async (g: GroupRow): Promise<void> => {
    if (!window.confirm(`Delete group "${g.name}"? Profiles in it will become ungrouped.`)) return
    try {
      await deleteGroup(g.id)
      reload()
      if (value === g.id) onChange(null)
    } catch (e) {
      window.alert(`Delete failed: ${(e as Error).message}`)
    }
  }

  const inputCls =
    'w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 flex items-center gap-2 cursor-pointer'

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={inputCls}>
        {selected && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: selected.color ?? 'var(--t4)' }}
          />
        )}
        <span
          className={'flex-1 min-w-0 truncate text-left ' + (selected ? '' : 'text-[var(--t3)]')}
        >
          {selected ? selected.name : 'No group'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-72 overflow-auto bg-[var(--panel)] border border-[var(--line)] rounded-lg shadow-lg py-1">
          <MenuRow
            label="No group"
            active={value === null}
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
          />
          {groups.length > 0 && <div className="my-1 border-t border-[var(--line-2)]" />}
          {groups.map((g) =>
            editingId === g.id ? (
              <GroupEditRow
                key={g.id}
                initialName={g.name}
                initialColor={g.color ?? ''}
                onSave={(name, color) => saveEdit(g, name, color)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <MenuRow
                key={g.id}
                label={g.name}
                color={g.color}
                active={value === g.id}
                onClick={() => {
                  onChange(g.id)
                  setOpen(false)
                }}
                onEdit={canEdit ? () => setEditingId(g.id) : undefined}
                onDelete={canDelete ? () => del(g) : undefined}
              />
            )
          )}
          {canManage && (
            <>
              <div className="my-1 border-t border-[var(--line-2)]" />
              {creating ? (
                <GroupCreateRow onCreate={create} onCancel={() => setCreating(false)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[var(--t3)] hover:text-[var(--red)] hover:bg-[var(--hover)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New group
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuRow({
  label,
  color,
  active,
  onClick,
  onEdit,
  onDelete
}: {
  label: string
  color?: string | null
  active: boolean
  onClick: () => void
  onEdit?: () => void
  onDelete?: () => void
}): React.ReactElement {
  return (
    <div
      className={
        'group/mr w-full flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer ' +
        (active
          ? 'bg-[var(--red-soft)] text-[var(--red)] font-semibold'
          : 'text-[var(--t1)] hover:bg-[var(--hover)]')
      }
      onClick={onClick}
    >
      {color !== undefined && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color ?? 'var(--t4)' }}
        />
      )}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="opacity-0 group-hover/mr:opacity-100 p-0.5 rounded text-[var(--t4)] hover:text-[var(--t1)] transition-opacity"
          title="Edit group"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="opacity-0 group-hover/mr:opacity-100 p-0.5 rounded text-[var(--t4)] hover:text-[var(--red)] transition-opacity"
          title="Delete group"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
