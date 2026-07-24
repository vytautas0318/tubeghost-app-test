import * as React from 'react'
import { useState } from 'react'
import { X, AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'

// Destructive type-to-confirm dialog for deleting a role. The Delete button
// stays disabled until the user types the role's exact name, so a role can't
// be removed by a stray click. Warns about the real consequence: deleting a
// role CASCADE-deletes the user_roles rows of its members (ON DELETE CASCADE),
// leaving them with no role — and therefore no permissions — in the workspace.
export function DeleteRoleDialog({
  roleName,
  memberCount,
  onClose,
  onConfirm
}: {
  roleName: string
  memberCount: number
  onClose: () => void
  onConfirm: () => Promise<void>
}): React.ReactElement {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = typed.trim() === roleName

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!matches || busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError((err as Error).message || 'Failed to delete role.')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
        className="max-w-md w-full mx-4 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[var(--t1)] flex items-center gap-2">
            <AlertTriangle size={17} className="text-[var(--red)]" />
            Delete role
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--t3)] hover:bg-[var(--hover)]"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-sm text-[var(--t2)] mb-3">
          This permanently deletes the role{' '}
          <span className="font-semibold text-[var(--t1)]">{roleName}</span>. This can’t be undone.
        </p>

        {memberCount > 0 && (
          <div className="mb-3 text-xs text-[var(--t2)] bg-[var(--red-soft)] border border-[var(--red)]/25 rounded-lg p-3">
            <span className="font-semibold text-[var(--red)]">
              {memberCount} member{memberCount === 1 ? '' : 's'}
            </span>{' '}
            currently {memberCount === 1 ? 'has' : 'have'} this role. Deleting it removes their role
            entirely — they’ll be left with no role (and no permissions) until you assign them a new
            one.
          </div>
        )}

        <label className="block text-[11px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
          Type <span className="normal-case font-bold text-[var(--t1)]">{roleName}</span> to confirm
        </label>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={roleName}
          autoComplete="off"
          spellCheck={false}
          className="w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
        />

        {error && <p className="mt-2 text-xs text-[var(--red)]">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={<Trash2 size={15} />}
            disabled={!matches || busy}
            title={!matches ? 'Type the role name exactly to enable delete' : undefined}
          >
            {busy ? 'Deleting…' : 'Delete role'}
          </Button>
        </div>
      </form>
    </div>
  )
}
