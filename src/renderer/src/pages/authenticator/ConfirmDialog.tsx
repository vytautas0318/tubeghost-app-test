import * as React from 'react'

// Generic confirm modal (mirrors members/ConfirmRemoveModal) used for the
// destructive Remove action and the sensitive "Show setup key" reveal, both
// of which must re-confirm before proceeding (§5, §9).
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm
}: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="max-w-sm w-full mx-4 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-[var(--t1)] mb-1">{title}</h3>
        <div className="text-sm text-[var(--t2)] mb-4">{body}</div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-[var(--hover)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={
              'px-3 py-1.5 text-sm font-medium rounded-lg text-white ' +
              (danger
                ? 'bg-[var(--red)] hover:bg-[var(--red-hover)]'
                : 'bg-[var(--t1)] hover:opacity-90')
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Shows the revealed Base32 secret with a copy button. Only rendered after a
// successful, permission-checked reveal.
export function SetupKeyDialog({
  issuer,
  secret,
  onClose,
  onCopy
}: {
  issuer: string
  secret: string
  onClose: () => void
  onCopy: () => void
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="max-w-sm w-full mx-4 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-[var(--t1)] mb-1">Setup key · {issuer}</h3>
        <p className="text-xs text-[var(--t2)] mb-3">
          Anyone with this key can generate codes for this account. Keep it secret.
        </p>
        <div
          className="font-[var(--mono)] text-sm tracking-wider break-all bg-[var(--panel-2)] border border-[var(--line)] rounded-[var(--r)] p-3 mb-4"
          style={{ fontFamily: 'var(--mono)' }}
        >
          {secret}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-[var(--hover)]"
          >
            Close
          </button>
          <button
            onClick={onCopy}
            className="px-3 py-1.5 text-sm font-medium rounded-lg text-white bg-[var(--t1)] hover:opacity-90"
          >
            Copy key
          </button>
        </div>
      </div>
    </div>
  )
}
