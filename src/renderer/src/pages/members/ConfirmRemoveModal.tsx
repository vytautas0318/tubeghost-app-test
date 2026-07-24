import * as React from 'react'
import { shortId, type ViewMember } from './types'

export function ConfirmRemoveModal({
  member,
  onCancel,
  onConfirm
}: {
  member: ViewMember
  onCancel: () => void
  onConfirm: () => void
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="max-w-sm w-full mx-4 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-[var(--t1)] mb-1">Remove member?</h3>
        <p className="text-sm text-[var(--t2)] mb-4">
          <span className="font-medium text-[var(--t1)]">
            {member.displayName ?? member.email ?? shortId(member.userId)}
          </span>
          {member.email && member.displayName && (
            <span className="text-xs text-[var(--t3)]"> ({member.email})</span>
          )}{' '}
          will lose access to this workspace immediately. They can be re-invited later.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-[var(--hover)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)]"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
