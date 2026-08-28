// Tags widget for the profile editor's General tab. Mirrors the Group field: a
// closed dropdown trigger that opens a multi-select menu of the workspace tag
// registry (checkbox rows with color dot + inline edit/delete) plus a
// "+ New tag" row. Registry-backed via useWorkspaceTags (realtime) — the same
// source of truth as the Profiles list-page Tag filter. Creating a tag inserts
// a real `tags` row; toggling a row adds/removes the tag name on the profile.

import { Badge, DEFAULT_TAG_COLOR } from '@tubeghost/ui'
import * as React from 'react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPopover } from '../profiles-list/useAnchoredPopover'
import { ChevronDown, Plus } from 'lucide-react'
import { useWorkspaceTags } from '@/lib/useWorkspaceTags'
import { useHasPermission } from '@/lib/permissions'
import { TagEditRow } from '../profiles-list/TagRows'
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
  const [editingId, setEditingId] = useState<string | null>(null)
  // The field is a combobox: type to filter the registry, and when nothing
  // matches exactly, the same box offers to create what you typed. That
  // replaces a separate "+ New tag" mode — one input, one flow.
  const [query, setQuery] = useState('')

  // Tags is the LAST card on the General tab, so an in-flow `absolute` menu
  // opened downward past the bottom of the page — unreachable, because the page
  // would not scroll to it. This hook portals the panel to document.body with
  // position:fixed, flips it above the trigger when there is no room below, and
  // clamps it into the viewport. Same behaviour as the Profiles-list TagsCell.
  const [open, setOpenRaw] = useState(false)
  const setOpen = (v: boolean): void => {
    setOpenRaw(v)
    // Reset transient sub-states whenever the menu closes, matching what the
    // old outside-click handler did.
    if (!v) {
      setQuery('')
      setEditingId(null)
    }
  }
  const { triggerRef, panelRef, style } = useAnchoredPopover(open, setOpen, 320, true)

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
    setQuery('')
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

  const trimmed = query.trim()
  const visible = trimmed
    ? registryTags.filter((t) => t.name.toLowerCase().includes(trimmed.toLowerCase()))
    : registryTags
  // Only offer creation for a genuinely new name — an exact (case-insensitive)
  // match should select the existing tag, not make a near-duplicate.
  const canCreateTyped =
    canCreate &&
    trimmed.length > 0 &&
    !registryTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())

  const triggerCls =
    'w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 flex items-center gap-1.5 flex-wrap cursor-pointer min-h-[40px]'

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={triggerCls}
      >
        {tags.length === 0 ? (
          <span className="flex-1 text-left text-[var(--t3)]">Search or create tags…</span>
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

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            className="z-50 max-h-72 overflow-auto bg-[var(--panel)] border border-[var(--line)] rounded-lg shadow-[var(--shadow-pop)] py-1"
          >
          <div className="p-2 border-b border-[var(--line)]">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Enter creates the typed tag when it is genuinely new, so the
                  // whole flow is: type, Enter. Falls through to selecting the
                  // single match when there is exactly one.
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (canCreateTyped) void create(trimmed, DEFAULT_TAG_COLOR)
                  else if (visible.length === 1) toggle(visible[0].name)
                }}
                placeholder="Search or create a tag…"
                className="w-full px-2 py-1.5 text-xs bg-[var(--panel-2)] border border-[var(--line)] rounded-[var(--r-sm)] text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
              />
            </div>
            {/* Create row sits FIRST when the query is new: it is the reason the
                user typed something the list could not match. */}
            {canCreateTyped && (
              <button
                type="button"
                onClick={() => void create(trimmed, DEFAULT_TAG_COLOR)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--t1)] hover:bg-[var(--hover)]"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--red)]" />
                Create <span className="font-semibold">“{trimmed}”</span>
              </button>
            )}
            {visible.length === 0 && !canCreateTyped && (
              <div className="px-3 py-2 text-[11px] text-[var(--t3)]">
                {registryTags.length === 0 ? 'No tags yet — type to create one.' : 'No matches.'}
              </div>
            )}
            {visible.map((t) =>
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
          </div>,
          document.body
        )}
    </div>
  )
}
