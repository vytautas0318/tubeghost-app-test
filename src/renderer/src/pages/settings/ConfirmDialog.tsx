import * as React from 'react'
import { useState } from 'react'
import { Button } from '@tubeghost/ui'

// Shared confirm dialog for destructive Settings actions. Mirrors the modal
// shell used elsewhere (members/ConfirmRemoveModal). When `confirmPhrase` is
// set, the confirm button stays disabled until the user types it exactly
// (used by Delete workspace → type the workspace name).
export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  confirmPhrase,
  danger = true,
  busy = false,
  onCancel,
  onConfirm
}: {
  title: string
  body: React.ReactNode
  confirmLabel?: string
  confirmPhrase?: string
  danger?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}): React.ReactElement {
  const [typed, setTyped] = useState('')
  const locked = confirmPhrase !== undefined && typed.trim() !== confirmPhrase

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="max-w-sm w-full mx-4 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-[var(--t1)] mb-1">{title}</h3>
        <div className="text-sm text-[var(--t2)] mb-4">{body}</div>
        {confirmPhrase !== undefined && (
          <div className="mb-4">
            <label className="flabel">
              Type <span className="font-semibold text-[var(--t1)]">{confirmPhrase}</span> to
              confirm
            </label>
            <input
              className="inp"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmPhrase}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={danger ? 'primary' : undefined}
            disabled={locked || busy}
            style={danger ? undefined : { borderColor: 'var(--red-soft-2)', color: 'var(--red)' }}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
