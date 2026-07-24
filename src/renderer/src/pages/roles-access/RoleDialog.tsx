import * as React from 'react'
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui'

// Create-role / rename-role dialog. Same modal shell as InviteDialog so it
// reads native to the app. `mode` switches copy + which fields show.
export function RoleDialog({
  mode,
  initialName = '',
  initialDescription = '',
  onClose,
  onSubmit
}: {
  mode: 'create' | 'rename'
  initialName?: string
  initialDescription?: string
  onClose: () => void
  onSubmit: (name: string, description: string) => Promise<void>
}): React.ReactElement {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the role a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(trimmed, description.trim())
      onClose()
    } catch (err) {
      setError((err as Error).message || 'Something went wrong.')
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
          <h3 className="text-base font-bold text-[var(--t1)]">
            {mode === 'create' ? 'Create role' : 'Rename role'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--t3)] hover:bg-[var(--hover)]"
          >
            <X size={16} />
          </button>
        </div>

        <label className="block text-[11px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
          Name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Content lead"
          className="w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 mb-3"
        />

        {mode === 'create' && (
          <>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
              Description <span className="text-[var(--t4)] normal-case">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder="What can this role do?"
              className="w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 resize-none"
            />
            <p className="mt-2 text-[11px] text-[var(--t4)]">
              New roles start from the Viewer baseline — tune permissions after creating.
            </p>
          </>
        )}

        {error && <p className="mt-2 text-xs text-[var(--red)]">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={<Check size={15} />} disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Create role' : 'Save name'}
          </Button>
        </div>
      </form>
    </div>
  )
}
