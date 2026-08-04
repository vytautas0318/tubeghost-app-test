// Inline Tags editor for the Profiles list. Attach/detach tags on a profile,
// create a new tag WITH a chosen color, and edit an existing tag's name/color.
// Tag colors are the shared workspace registry (lib/tags via useWorkspaceTags),
// so a color set here shows the same everywhere (Authenticator included).

import * as React from 'react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import { updateProfile, type ProfileRow as ProfileRowType } from '@/lib/profiles'
import { Badge } from '@/components/ui'
import { useAnchoredPopover } from './useAnchoredPopover'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { useWorkspaceTags } from '@/lib/useWorkspaceTags'
import { DEFAULT_TAG_COLOR } from '@/lib/tags'
import { TagsPopover } from './TagsPopover'

const stop = (e: React.MouseEvent | React.SyntheticEvent): void => e.stopPropagation()

export function TagsCell({
  raw,
  canEdit,
  onChanged
}: {
  raw: ProfileRowType
  // allTags kept for API compatibility with the row; suggestions now come from
  // the workspace tag registry. Accepted but unused.
  allTags?: string[]
  canEdit: boolean
  // With an updated row → patched in place. Without → full refetch, needed
  // for a registry-wide tag rename, which rewrites every profile's tags.
  onChanged: (updated?: ProfileRowType) => void
}): React.ReactElement {
  const workspaceId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const canTagCreate = useHasPermission('tags.create')
  const canTagEdit = useHasPermission('tags.edit')
  const canTagDelete = useHasPermission('tags.delete')
  const { tags: wsTags, colorFor, createTag, editTag, removeTag } = useWorkspaceTags(workspaceId)

  const [open, setOpen] = useState(false)
  const { triggerRef, panelRef, style } = useAnchoredPopover(open, setOpen, 256)
  const [input, setInput] = useState('')
  const [newColor, setNewColor] = useState<string>(DEFAULT_TAG_COLOR)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<string>(DEFAULT_TAG_COLOR)

  const tags = useMemo(() => raw.tags ?? [], [raw.tags])

  // Look up a registry row for an attached tag name (case-insensitive) so an
  // already-attached tag can be edited/recolored from its chip. Null when the
  // name isn't in the registry (a legacy free-text tag) → no edit affordance.
  const rowFor = (name: string): { id: string; color: string } | null => {
    const t = wsTags.find((w) => w.name.toLowerCase() === name.toLowerCase())
    return t ? { id: t.id, color: t.color } : null
  }

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase()
    return wsTags
      .filter((t) => !tags.some((x) => x.toLowerCase() === t.name.toLowerCase()))
      .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
      .slice(0, 8)
  }, [wsTags, tags, input])

  const canCreateFromInput = useMemo(() => {
    const q = input.trim().toLowerCase()
    if (!q || !canTagCreate) return false
    return (
      !wsTags.some((t) => t.name.toLowerCase() === q) && !tags.some((t) => t.toLowerCase() === q)
    )
  }, [wsTags, tags, input, canTagCreate])

  const attach = async (name: string): Promise<void> => {
    const t = name.trim()
    if (!t || tags.includes(t) || saving) return
    setSaving(true)
    try {
      const updated = await updateProfile(raw.id, { tags: [...tags, t] })
      setInput('')
      onChanged(updated)
    } finally {
      setSaving(false)
    }
  }

  // Create the tag in the registry (with its color) THEN attach it to the row.
  const createAndAttach = async (): Promise<void> => {
    const name = input.trim()
    if (!name || !canTagCreate) return
    await createTag(name, newColor).catch(() => undefined)
    await attach(name)
    setNewColor(DEFAULT_TAG_COLOR)
  }

  const detach = async (t: string): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const updated = await updateProfile(raw.id, { tags: tags.filter((x) => x !== t) })
      onChanged(updated)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (id: string, name: string, color: string): void => {
    setEditingId(id)
    setEditName(name)
    setEditColor(color)
  }
  const saveEdit = (): void => {
    const id = editingId
    const name = editName.trim()
    setEditingId(null)
    if (!id || !name) return
    // editTag renames in the registry AND cascades the new name into every
    // profile's tags array (rename_tag RPC). Reload the row so a renamed tag
    // shows its new label here immediately.
    void editTag(id, name, editColor).then(() => onChanged())
  }

  if (!canEdit) {
    return (
      <div className="flex gap-1 flex-wrap">
        {tags.map((t) => (
          <Badge key={t} color={colorFor(t)}>
            {t}
          </Badge>
        ))}
      </div>
    )
  }

  return (
    <div className="relative" onClick={stop}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 flex-wrap text-left min-h-[24px] w-full rounded px-1 -mx-1 py-0.5 transition-colors group-hover:hover:bg-[var(--hover)]"
      >
        {tags.length === 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--t4)] hover:text-[var(--red)] opacity-0 group-hover:opacity-100 transition-opacity">
            <Plus className="w-3 h-3" />
            Add tag
          </span>
        )}
        {tags.map((t) => (
          <Badge key={t} color={colorFor(t)}>
            {t}
          </Badge>
        ))}
      </button>

      {open &&
        createPortal(
          <TagsPopover
            panelRef={panelRef}
            style={style}
            tags={tags}
            suggestions={suggestions}
            colorFor={colorFor}
            rowFor={rowFor}
            input={input}
            setInput={setInput}
            newColor={newColor}
            setNewColor={setNewColor}
            canCreateFromInput={canCreateFromInput}
            canTagEdit={canTagEdit}
            canTagDelete={canTagDelete}
            editingId={editingId}
            editName={editName}
            setEditName={setEditName}
            editColor={editColor}
            setEditColor={setEditColor}
            onClose={() => setOpen(false)}
            attach={(name) => void attach(name)}
            detach={(name) => void detach(name)}
            createAndAttach={() => void createAndAttach()}
            startEdit={startEdit}
            cancelEdit={() => setEditingId(null)}
            saveEdit={saveEdit}
            removeTag={(id) => void removeTag(id)}
          />,
          document.body
        )}
    </div>
  )
}
