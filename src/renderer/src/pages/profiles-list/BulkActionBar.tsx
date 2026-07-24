import * as React from 'react'
import { useMemo, useRef, useState } from 'react'
import { FolderInput, Plus, Tag, TagsIcon, Trash2, X, Pencil } from 'lucide-react'
import {
  bulkAddTags,
  bulkDeleteProfiles,
  bulkMoveToGroup,
  bulkRemoveTags,
  renameTagInWorkspace,
  type BulkResult
} from '@/lib/profiles'
import type { GroupRow } from '@/lib/groups'
import type { ProfileRow } from '@/lib/profiles'

// Bulk-action bar for the Profiles list. Renders only when at least
// one row is selected. Fixed to the bottom of the table panel so it
// doesn't compete with the Pagination footer for screen real estate.
//
// Permission gating is the caller's responsibility — pass canEdit /
// canDelete from useHasPermission(). RLS is the real source of truth
// either way; the buttons just hide for UX clarity.

export interface BulkActionBarProps {
  selected: Set<string>
  selectedRows: ProfileRow[] // raw rows for the selected ids — used for "tags currently set"
  groups: GroupRow[]
  allTags: string[]
  canEdit: boolean
  canDelete: boolean
  workspaceId: string
  onClear: () => void
  onChanged: (result: BulkResult) => void
}

type Modal =
  | null
  | { kind: 'add-tag' }
  | { kind: 'remove-tag' }
  | { kind: 'rename-tag' }
  | { kind: 'move-group' }
  | { kind: 'delete' }

export function BulkActionBar({
  selected,
  selectedRows,
  groups,
  allTags,
  canEdit,
  canDelete,
  workspaceId,
  onClear,
  onChanged
}: BulkActionBarProps): React.ReactElement | null {
  const [modal, setModal] = useState<Modal>(null)
  const [working, setWorking] = useState(false)
  const ids = useMemo(() => [...selected], [selected])
  const count = ids.length

  const tagsOnSelected = useMemo(() => {
    const s = new Set<string>()
    for (const r of selectedRows) for (const t of r.tags ?? []) s.add(t)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [selectedRows])

  if (count === 0) return null

  const close = (): void => setModal(null)

  const run = async (op: () => Promise<BulkResult>): Promise<void> => {
    if (working) return
    setWorking(true)
    try {
      const r = await op()
      onChanged(r)
      close()
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <div className="border-t border-[var(--line)] bg-brand-cream/60 dark:bg-night-base/60 px-4 py-2 flex items-center gap-2 text-sm">
        <span className="text-[var(--t1)] font-medium">
          {count} selected
        </span>
        <span className="text-[var(--t4)]">·</span>
        {canEdit && (
          <>
            <BarButton
              icon={<Plus className="w-3.5 h-3.5" />}
              label="Add tag"
              onClick={() => setModal({ kind: 'add-tag' })}
            />
            <BarButton
              icon={<Tag className="w-3.5 h-3.5" />}
              label="Remove tag"
              onClick={() => setModal({ kind: 'remove-tag' })}
              disabled={tagsOnSelected.length === 0}
              title={
                tagsOnSelected.length === 0
                  ? 'None of the selected profiles have tags yet'
                  : undefined
              }
            />
            <BarButton
              icon={<FolderInput className="w-3.5 h-3.5" />}
              label="Move to group"
              onClick={() => setModal({ kind: 'move-group' })}
            />
            <BarButton
              icon={<Pencil className="w-3.5 h-3.5" />}
              label="Rename tag"
              onClick={() => setModal({ kind: 'rename-tag' })}
              disabled={allTags.length === 0}
              title={
                allTags.length === 0
                  ? 'No tags exist in this workspace yet'
                  : undefined
              }
            />
          </>
        )}
        {canDelete && (
          <BarButton
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label="Delete"
            danger
            onClick={() => setModal({ kind: 'delete' })}
          />
        )}
        <span className="ml-auto" />
        <button
          onClick={onClear}
          className="text-xs text-[var(--t3)] hover:text-[var(--t1)] dark:hover:text-night-text inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Clear selection
        </button>
      </div>

      {modal?.kind === 'add-tag' && (
        <TagInputModal
          title={`Add tag to ${count} ${count === 1 ? 'profile' : 'profiles'}`}
          allTags={allTags}
          working={working}
          onCancel={close}
          onSubmit={(tags) => run(() => bulkAddTags(ids, tags))}
        />
      )}

      {modal?.kind === 'remove-tag' && (
        <TagInputModal
          title={`Remove tag from ${count} ${count === 1 ? 'profile' : 'profiles'}`}
          allTags={tagsOnSelected}
          working={working}
          onCancel={close}
          onSubmit={(tags) => run(() => bulkRemoveTags(ids, tags))}
          submitLabel="Remove"
          requirePick
        />
      )}

      {modal?.kind === 'move-group' && (
        <MoveToGroupModal
          count={count}
          groups={groups}
          working={working}
          onCancel={close}
          onSubmit={(groupId) => run(() => bulkMoveToGroup(ids, groupId))}
        />
      )}

      {modal?.kind === 'rename-tag' && (
        <RenameTagModal
          allTags={allTags}
          working={working}
          onCancel={close}
          onSubmit={(from, to) =>
            run(() => renameTagInWorkspace(workspaceId, from, to))
          }
        />
      )}

      {modal?.kind === 'delete' && (
        <ConfirmDeleteModal
          count={count}
          working={working}
          onCancel={close}
          onConfirm={() => run(() => bulkDeleteProfiles(ids))}
        />
      )}
    </>
  )
}

function BarButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
  title
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  title?: string
}): React.ReactElement {
  const base =
    'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const tone = danger
    ? 'border-[var(--red)]/25 text-[var(--red)] hover:bg-[var(--red-soft)]'
    : 'border-[var(--line)] text-[var(--t1)] hover:bg-white dark:hover:bg-night-raised'
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`${base} ${tone}`}>
      {icon}
      {label}
    </button>
  )
}

// ---- modals ----

function ModalShell({
  children,
  onCancel
}: {
  children: React.ReactNode
  onCancel: () => void
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="max-w-md w-full mx-4 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function TagInputModal({
  title,
  allTags,
  working,
  onCancel,
  onSubmit,
  submitLabel = 'Add',
  requirePick = false
}: {
  title: string
  allTags: string[]
  working: boolean
  onCancel: () => void
  onSubmit: (tags: string[]) => void
  submitLabel?: string
  requirePick?: boolean
}): React.ReactElement {
  const [chips, setChips] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase()
    return allTags
      .filter((t) => !chips.includes(t))
      .filter((t) => (q ? t.toLowerCase().includes(q) : true))
      .slice(0, 12)
  }, [allTags, chips, input])

  const addChip = (raw: string): void => {
    const t = raw.trim().replace(/,$/, '')
    if (!t || chips.includes(t)) {
      setInput('')
      return
    }
    if (requirePick && !allTags.includes(t)) {
      setInput('')
      return
    }
    setChips((c) => [...c, t])
    setInput('')
  }

  return (
    <ModalShell onCancel={onCancel}>
      <h3 className="text-base font-bold text-[var(--t1)] mb-3">
        {title}
      </h3>
      <div className="relative">
        <div
          onClick={() => {
            inputRef.current?.focus()
            setOpen(true)
          }}
          className="flex flex-wrap gap-1.5 p-2 bg-[var(--panel-2)] border border-[var(--line)] rounded-lg min-h-[44px] cursor-text"
        >
          {chips.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 text-xs bg-[var(--red-soft)] text-[var(--red)] rounded-md font-medium flex items-center gap-1"
            >
              {t}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setChips((c) => c.filter((x) => x !== t))
                }}
                className="opacity-60 hover:opacity-100"
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={input}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setInput(e.target.value)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addChip(input)
              } else if (e.key === 'Escape') {
                setOpen(false)
              } else if (e.key === 'Backspace' && !input && chips.length) {
                setChips((c) => c.slice(0, -1))
              }
            }}
            className="flex-1 min-w-[100px] bg-transparent text-xs text-[var(--t1)] focus:outline-none"
            placeholder={
              requirePick
                ? 'Pick a tag from the suggestions…'
                : 'Type a tag and press Enter…'
            }
          />
        </div>
        {open && filtered.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-auto bg-[var(--panel)] border border-[var(--line)] rounded-lg shadow-lg py-1">
            {filtered.map((t) => (
              <button
                key={t}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addChip(t)}
                className="w-full text-left px-3 py-1.5 text-xs text-[var(--t1)] hover:bg-[var(--red-soft)]"
              >
                <span className="px-1.5 py-0.5 bg-[var(--red-soft)] text-[var(--red)] rounded font-medium">
                  {t}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <ModalButtons
        onCancel={onCancel}
        onSubmit={() => onSubmit(chips)}
        submitLabel={submitLabel}
        working={working}
        disabled={chips.length === 0}
      />
    </ModalShell>
  )
}

function MoveToGroupModal({
  count,
  groups,
  working,
  onCancel,
  onSubmit
}: {
  count: number
  groups: GroupRow[]
  working: boolean
  onCancel: () => void
  onSubmit: (groupId: string | null) => void
}): React.ReactElement {
  const [groupId, setGroupId] = useState<string>('__ungrouped__')
  return (
    <ModalShell onCancel={onCancel}>
      <h3 className="text-base font-bold text-[var(--t1)] mb-3">
        Move {count} {count === 1 ? 'profile' : 'profiles'} to group
      </h3>
      <select
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        className="w-full px-2.5 py-2 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
      >
        <option value="__ungrouped__">— Ungrouped —</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <ModalButtons
        onCancel={onCancel}
        onSubmit={() => onSubmit(groupId === '__ungrouped__' ? null : groupId)}
        submitLabel="Move"
        working={working}
      />
    </ModalShell>
  )
}

function RenameTagModal({
  allTags,
  working,
  onCancel,
  onSubmit
}: {
  allTags: string[]
  working: boolean
  onCancel: () => void
  onSubmit: (from: string, to: string) => void
}): React.ReactElement {
  const [from, setFrom] = useState(allTags[0] ?? '')
  const [to, setTo] = useState('')
  return (
    <ModalShell onCancel={onCancel}>
      <h3 className="text-base font-bold text-[var(--t1)] mb-1 flex items-center gap-2">
        <TagsIcon className="w-4 h-4" />
        Rename tag workspace-wide
      </h3>
      <p className="text-xs text-[var(--t3)] mb-3">
        Updates every profile that currently uses this tag. Cannot be undone.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
            From
          </span>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-lg text-[var(--t1)]"
          >
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
            To
          </span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="new tag"
            maxLength={40}
            className="w-full px-2 py-1.5 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-lg text-[var(--t1)]"
          />
        </label>
      </div>
      <ModalButtons
        onCancel={onCancel}
        onSubmit={() => onSubmit(from, to)}
        submitLabel="Rename"
        working={working}
        disabled={!from.trim() || !to.trim() || from.trim() === to.trim()}
      />
    </ModalShell>
  )
}

function ConfirmDeleteModal({
  count,
  working,
  onCancel,
  onConfirm
}: {
  count: number
  working: boolean
  onCancel: () => void
  onConfirm: () => void
}): React.ReactElement {
  return (
    <ModalShell onCancel={onCancel}>
      <h3 className="text-base font-bold text-[var(--t1)] mb-1">
        Delete {count} {count === 1 ? 'profile' : 'profiles'}?
      </h3>
      <p className="text-sm text-[var(--t2)] mb-4">
        This cannot be undone. Proxies assigned to these profiles will be released back to
        the workspace pool.
      </p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-[var(--hover)]"
        >
          Cancel
        </button>
        <button
          disabled={working}
          onClick={onConfirm}
          className="px-3 py-1.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-50"
        >
          {working ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </ModalShell>
  )
}

function ModalButtons({
  onCancel,
  onSubmit,
  submitLabel,
  working,
  disabled
}: {
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  working: boolean
  disabled?: boolean
}): React.ReactElement {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <button
        onClick={onCancel}
        className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-[var(--hover)]"
      >
        Cancel
      </button>
      <button
        disabled={working || disabled}
        onClick={onSubmit}
        className="px-3 py-1.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-50"
      >
        {working ? 'Working…' : submitLabel}
      </button>
    </div>
  )
}

