// Presentational pieces for the Proxies bulk-action bar: the toolbar button
// and the two modals (set-tag, confirm-delete). Split out of
// ProxyBulkActionBar.tsx to keep both files under the 250-line rule.

import * as React from 'react'
import { useState } from 'react'

export function BarButton({
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

// A proxy has a single label (not a tag array like profiles), so this SETS the
// tag on every selected row rather than merging into a list.
export function SetTagModal({
  count,
  working,
  onCancel,
  onSubmit
}: {
  count: number
  working: boolean
  onCancel: () => void
  onSubmit: (label: string) => void
}): React.ReactElement {
  const [value, setValue] = useState('')
  return (
    <ModalShell onCancel={onCancel}>
      <h3 className="text-base font-bold text-[var(--t1)] mb-1">
        Tag {count} {count === 1 ? 'proxy' : 'proxies'}
      </h3>
      <p className="text-xs text-[var(--t3)] mb-3">
        Replaces the existing tag on every selected proxy.
      </p>
      <input
        autoFocus
        value={value}
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onSubmit(value.trim())
        }}
        placeholder="e.g. us-east"
        className="w-full px-2.5 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
      />
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-[var(--hover)]"
        >
          Cancel
        </button>
        <button
          disabled={working || !value.trim()}
          onClick={() => onSubmit(value.trim())}
          className="px-3 py-1.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-50"
        >
          {working ? 'Working…' : 'Apply'}
        </button>
      </div>
    </ModalShell>
  )
}

export function ConfirmDeleteModal({
  count,
  skipped,
  working,
  onCancel,
  onConfirm
}: {
  count: number
  skipped: number
  working: boolean
  onCancel: () => void
  onConfirm: () => void
}): React.ReactElement {
  return (
    <ModalShell onCancel={onCancel}>
      <h3 className="text-base font-bold text-[var(--t1)] mb-1">
        Delete {count} {count === 1 ? 'proxy' : 'proxies'}?
      </h3>
      <p className="text-sm text-[var(--t2)] mb-4">
        This cannot be undone.
        {skipped > 0 && (
          <>
            {' '}
            {skipped} selected {skipped === 1 ? 'proxy is' : 'proxies are'} skipped — purchased
            proxies are cancelled from your subscription, and in-use proxies must be unassigned
            first.
          </>
        )}
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
