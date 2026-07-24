// Group filter + drop-target sidebar on the Profiles list page.
//
// Click a group → filter the table to its members.
// Drag a row onto a group → assign that profile to the group.
// "All" virtual entry → show everything; drop here removes group.
// "Ungrouped" → profiles with group_id = null.
// Right-click a group → rename / recolor / delete.
// "+ New group" at the bottom opens an inline create row.
// Collapse toggle hides labels and shows just colored dots (~48px wide).

import * as React from 'react'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, FolderClosed, FolderOpen, Inbox, Plus } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import {
  assignProfileGroup,
  createGroup,
  deleteGroup,
  listGroups,
  updateGroup,
  type GroupRow
} from '@/lib/groups'
import { GroupCreateRow } from './GroupCreateRow'
import { GroupContextMenu } from './GroupContextMenu'
import { GroupItem, GroupRenameRow } from './GroupSidebarItem'

export type GroupFilter = 'all' | 'ungrouped' | string

const COLLAPSE_KEY = 'tpb.groupSidebar.collapsed'

export function GroupSidebar({
  filter,
  onChange,
  counts,
  onProfileDropped
}: {
  filter: GroupFilter
  onChange: (f: GroupFilter) => void
  counts: Record<string, number>
  onProfileDropped: () => void
}): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const canCreate = useHasPermission('groups.create')
  const canEdit = useHasPermission('groups.edit')
  const canDelete = useHasPermission('groups.delete')
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [hover, setHover] = useState<GroupFilter | null>(null)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch { /* ignore */ }
  }, [collapsed])

  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    listGroups(workspace.workspace_id)
      .then((g) => !cancelled && setGroups(g))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [workspace])

  const handleDrop = async (target: GroupFilter, e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setHover(null)
    const profileId = e.dataTransfer.getData('text/profile-id')
    if (!profileId) return
    const groupId = target === 'all' || target === 'ungrouped' ? null : target
    try {
      await assignProfileGroup(profileId, groupId)
      onProfileDropped()
    } catch (err) {
      window.alert(`Move failed: ${(err as Error).message}`)
    }
  }

  const onCreate = async (name: string, color: string): Promise<void> => {
    if (!workspace) return
    try {
      const g = await createGroup(workspace.workspace_id, name, color)
      setGroups((prev) => (prev.some((x) => x.id === g.id) ? prev : [...prev, g]))
      setCreating(false)
      onChange(g.id)
    } catch (e) {
      window.alert(`Create failed: ${(e as Error).message}`)
    }
  }

  const onRename = async (id: string, name: string): Promise<void> => {
    const trimmed = name.trim()
    setRenaming(null)
    if (!trimmed) return
    try {
      const updated = await updateGroup(id, { name: trimmed })
      setGroups((prev) => prev.map((g) => (g.id === id ? updated : g)))
    } catch (e) {
      window.alert(`Rename failed: ${(e as Error).message}`)
    }
  }

  const onRecolor = async (id: string, color: string): Promise<void> => {
    setMenu(null)
    try {
      const updated = await updateGroup(id, { color })
      setGroups((prev) => prev.map((g) => (g.id === id ? updated : g)))
    } catch (e) {
      window.alert(`Recolor failed: ${(e as Error).message}`)
    }
  }

  const onDelete = async (g: GroupRow): Promise<void> => {
    setMenu(null)
    const count = counts[g.id] ?? 0
    const msg =
      count > 0
        ? `Delete group "${g.name}"? ${count} profile(s) will become ungrouped.`
        : `Delete group "${g.name}"?`
    if (!window.confirm(msg)) return
    try {
      await deleteGroup(g.id)
      setGroups((prev) => prev.filter((x) => x.id !== g.id))
      if (filter === g.id) onChange('all')
      onProfileDropped()
    } catch (e) {
      window.alert(`Delete failed: ${(e as Error).message}`)
    }
  }

  const widthCls = collapsed ? 'w-10' : 'w-56'
  const menuGroup = menu ? groups.find((x) => x.id === menu.id) : null

  return (
    <div
      className={
        widthCls +
        ' shrink-0 py-1 flex flex-col transition-all overflow-hidden'
      }
    >
      <div className="flex items-center justify-between px-2 mb-3">
        {!collapsed && (
          <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--t3)]">
            Groups
          </span>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={
            'text-[var(--t3)] hover:text-[var(--t1)] transition-colors ' +
            (collapsed ? 'mx-auto' : '')
          }
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
      <ul className="space-y-1 flex-1 overflow-y-auto">
        <GroupItem id="all" label="All profiles"
          icon={filter === 'all' ? FolderOpen : FolderClosed}
          count={counts.all} collapsed={collapsed}
          active={filter === 'all'} hovered={hover === 'all'}
          onChange={onChange} onDrop={handleDrop} setHover={setHover} />
        <GroupItem id="ungrouped" label="Ungrouped" icon={Inbox}
          count={counts.ungrouped} collapsed={collapsed}
          active={filter === 'ungrouped'} hovered={hover === 'ungrouped'}
          onChange={onChange} onDrop={handleDrop} setHover={setHover} />
        {groups.map((g) =>
          renaming === g.id ? (
            <GroupRenameRow key={g.id} initial={g.name} color={g.color}
              onSubmit={(name) => onRename(g.id, name)} onCancel={() => setRenaming(null)} />
          ) : (
            <GroupItem key={g.id} id={g.id} label={g.name}
              icon={filter === g.id ? FolderOpen : FolderClosed}
              color={g.color} count={counts[g.id]} collapsed={collapsed}
              active={filter === g.id} hovered={hover === g.id}
              onChange={onChange} onDrop={handleDrop} setHover={setHover}
              onContextMenu={(canEdit || canDelete) ? (e) => {
                e.preventDefault()
                setMenu({ id: g.id, x: e.clientX, y: e.clientY })
              } : undefined} />
          )
        )}
        {creating && (
          <li><GroupCreateRow onCreate={onCreate} onCancel={() => setCreating(false)} /></li>
        )}
      </ul>
      {canCreate && !creating && (
        <button
          onClick={() => {
            if (collapsed) setCollapsed(false)
            setCreating(true)
          }}
          className={
            'mt-2 flex items-center gap-2 text-sm font-medium text-[var(--t3)] hover:text-[var(--t1)] transition-colors ' +
            (collapsed ? 'mx-auto p-1.5' : 'px-2 py-2')
          }
          title="New group"
        >
          <Plus className="w-4 h-4" />
          {!collapsed && 'New group'}
        </button>
      )}
      {menu && menuGroup && (
        <GroupContextMenu
          x={menu.x}
          y={menu.y}
          currentColor={menuGroup.color}
          onRename={() => {
            setMenu(null)
            if (canEdit) setRenaming(menuGroup.id)
          }}
          onRecolor={(c) => canEdit && void onRecolor(menuGroup.id, c)}
          onDelete={() => canDelete && void onDelete(menuGroup)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
