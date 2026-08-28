// Toolbar "Group" dropdown — replaces the old left GroupSidebar. Filters the
// table by group and preserves group management (create + delete) so removing
// the sidebar doesn't drop functionality. Matches the TubeGhost design's
// Group/Tag toolbar filters.

import * as React from 'react'
import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { createGroup, updateGroup, deleteGroup, type GroupRow } from '@/lib/groups'
import { FilterChip } from './FilterChip'
import { GroupCreateRow } from './GroupCreateRow'
import { GroupEditRow } from './GroupEditRow'
import type { GroupFilter } from './GroupSidebar'

export function GroupFilterDropdown({
  workspaceId,
  groups,
  filter,
  counts,
  canManage,
  canEdit,
  onChange,
  onGroupsChanged
}: {
  workspaceId: string
  groups: GroupRow[]
  filter: GroupFilter
  counts: Record<string, number>
  canManage: boolean
  canEdit: boolean
  onChange: (f: GroupFilter) => void
  onGroupsChanged: () => void
}): React.ReactElement {
  const currentName =
    filter === 'all'
      ? null
      : filter === 'ungrouped'
        ? 'Ungrouped'
        : (groups.find((g) => g.id === filter)?.name ?? null)

  return (
    <FilterChip label="Group" value={currentName}>
      {(close) => (
        <GroupMenu
          workspaceId={workspaceId}
          groups={groups}
          filter={filter}
          counts={counts}
          canManage={canManage}
          canEdit={canEdit}
          onPick={(f) => {
            onChange(f)
            close()
          }}
          onGroupsChanged={onGroupsChanged}
        />
      )}
    </FilterChip>
  )
}

function GroupMenu({
  workspaceId,
  groups,
  filter,
  counts,
  canManage,
  canEdit,
  onPick,
  onGroupsChanged
}: {
  workspaceId: string
  groups: GroupRow[]
  filter: GroupFilter
  counts: Record<string, number>
  canManage: boolean
  canEdit: boolean
  onPick: (f: GroupFilter) => void
  onGroupsChanged: () => void
}): React.ReactElement {
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const create = async (name: string, color: string): Promise<void> => {
    try {
      const g = await createGroup(workspaceId, name, color)
      setCreating(false)
      onGroupsChanged()
      onPick(g.id)
    } catch (e) {
      window.alert(`Create failed: ${(e as Error).message}`)
    }
  }

  const saveEdit = async (g: GroupRow, name: string, color: string): Promise<void> => {
    try {
      await updateGroup(g.id, { name, color })
      setEditingId(null)
      onGroupsChanged()
    } catch (e) {
      window.alert(`Rename failed: ${(e as Error).message}`)
    }
  }

  const del = async (g: GroupRow): Promise<void> => {
    const count = counts[g.id] ?? 0
    const msg =
      count > 0
        ? `Delete group "${g.name}"? ${count} profile(s) will become ungrouped.`
        : `Delete group "${g.name}"?`
    if (!window.confirm(msg)) return
    try {
      await deleteGroup(g.id)
      onGroupsChanged()
      if (filter === g.id) onPick('all')
    } catch (e) {
      window.alert(`Delete failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="py-1 min-w-[210px]">
      <MenuRow
        label="All profiles"
        count={counts.all}
        active={filter === 'all'}
        onClick={() => onPick('all')}
      />
      <MenuRow
        label="Ungrouped"
        count={counts.ungrouped}
        active={filter === 'ungrouped'}
        onClick={() => onPick('ungrouped')}
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
            count={counts[g.id] ?? 0}
            active={filter === g.id}
            onClick={() => onPick(g.id)}
            onEdit={canEdit ? () => setEditingId(g.id) : undefined}
            onDelete={canManage ? () => del(g) : undefined}
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
  )
}

function MenuRow({
  label,
  color,
  count,
  active,
  onClick,
  onEdit,
  onDelete
}: {
  label: string
  color?: string | null
  count?: number
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
      {count != null && (
        <span className="mono text-[10px] text-[var(--t3)] tabular-nums shrink-0">{count}</span>
      )}
    </div>
  )
}
