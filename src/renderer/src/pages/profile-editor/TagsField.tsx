// Tags widget for the profile editor's General tab. Mirrors the Group field: a
// closed dropdown trigger that opens a multi-select menu of the workspace tag
// registry (checkbox rows with color dot + inline edit/delete) plus a
// "+ New tag" row. Registry-backed via useWorkspaceTags (realtime) — the same
// source of truth as the Profiles list-page Tag filter. Creating a tag inserts
// a real `tags` row; toggling a row adds/removes the tag name on the profile.

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { useWorkspaceTags } from '@/lib/useWorkspaceTags'
import { useHasPermission } from '@/lib/permissions'
import { Badge } from '@/components/ui'
import { TagCreateRow, TagEditRow } from '../profiles-list/TagRows'
import { TagSuggestionRow } from './TagSuggestionRow'

export function TagsField({
  workspaceId,
  tags,
  onChange
}: {
  workspaceId: string | null
  tags: string[]
  onChange: (patch: { tags?: string[]; tagsInput?: string }) => void
}): React.ReactElement {
  const {
    tags: registryTags,
    colorFor,
    createTag,
    editTag,
    removeTag
  } = useWorkspaceTags(workspaceId)
  const canCreate = useHasPermission('tags.create')
  const canEdit = useHasPermission('tags.edit')
  const canDelete = useHasPermission('tags.delete')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

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

  const toggle = (name: string): void =>
    onChange({ tags: tags.includes(name) ? tags.filter((x) => x !== name) : [...tags, name] })

  const create = async (name: string, color: string): Promise<void> => {
    // Reuse an existing registry tag (case-insensitive) or create a row, then
    // select it on the profile.
    const existing = registryTags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (!existing) {
      try {
        await createTag(name, color)
      } catch (e) {
        window.alert(`Create failed: ${(e as Error).message}`)
        return
      }
    }
    setCreating(false)
    const finalName = existing?.name ?? name
    if (!tags.includes(finalName)) onChange({ tags: [...tags, finalName] })
  }

  const saveEdit = async (
    id: string,
    oldName: string,
    name: string,
    color: string
  ): Promise<void> => {
    try {
      await editTag(id, name, color)
    } catch (e) {
      window.alert(`Rename failed: ${(e as Error).message}`)
      return
    }
    // The profile references tags by name, so carry a rename onto its selection.
    if (name !== oldName && tags.includes(oldName)) {
      onChange({ tags: tags.map((x) => (x === oldName ? name : x)) })
    }
    setEditingId(null)
  }

  const del = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`Delete tag "${name}"? It will be removed from all profiles.`)) return
    try {
      await removeTag(id)
    } catch (e) {
      window.alert(`Delete failed: ${(e as Error).message}`)
      return
    }
    if (tags.includes(name)) onChange({ tags: tags.filter((x) => x !== name) })
  }

  const triggerCls =
    'w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 flex items-center gap-1.5 flex-wrap cursor-pointer min-h-[40px]'

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={triggerCls}>
        {tags.length === 0 ? (
          <span className="flex-1 text-left text-[var(--t3)]">Select or create tags…</span>
        ) : (
          <span className="flex-1 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} color={colorFor(t)}>
                {t}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(t)
                  }}
                  className="opacity-60 hover:opacity-100 cursor-pointer"
                >
                  ×
                </span>
              </Badge>
            ))}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-72 overflow-auto bg-[var(--panel)] border border-[var(--line)] rounded-lg shadow-lg py-1">
          {registryTags.length === 0 && !creating && (
            <div className="px-3 py-2 text-[11px] text-[var(--t3)]">No tags yet</div>
          )}
          {registryTags.map((t) =>
            editingId === t.id ? (
              <TagEditRow
                key={t.id}
                initialName={t.name}
                initialColor={t.color}
                onSave={(name, color) => saveEdit(t.id, t.name, name, color)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <TagSuggestionRow
                key={t.id}
                name={t.name}
                color={colorFor(t.name)}
                checked={tags.includes(t.name)}
                canEdit={canEdit}
                canDelete={canDelete}
                onToggle={() => toggle(t.name)}
                onEdit={() => setEditingId(t.id)}
                onDelete={() => void del(t.id, t.name)}
              />
            )
          )}
          {canCreate && (
            <>
              <div className="my-1 border-t border-[var(--line-2)]" />
              {creating ? (
                <TagCreateRow onCreate={create} onCancel={() => setCreating(false)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[var(--t3)] hover:text-[var(--red)] hover:bg-[var(--hover)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New tag
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
