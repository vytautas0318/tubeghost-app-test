import * as React from 'react'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui'

// Add-numbers dialog: enter a US phone number (+ optional label) to add it to
// the subscription. Client-side validation mirrors what a real US non-VoIP
// number looks like (10 digits, or 11 starting with 1) for fast feedback.
export function AddNumbersDialog({
  onClose,
  onSubmit
}: {
  onClose: () => void
  onSubmit: (input: { number: string; label?: string }) => Promise<void> | void
}): React.ReactElement {
  const [number, setNumber] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    const digits = number.replace(/\D/g, '')
    const ok = digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
    if (!ok) {
      setError('Enter a valid US phone number.')
      return
    }
    const e164 = `+1${digits.length === 11 ? digits.slice(1) : digits}`
    setBusy(true)
    try {
      await onSubmit({ number: e164, label: label.trim() || undefined })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add number.')
    } finally {
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
          <h3 className="text-base font-bold text-[var(--t1)]">Add phone number</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--t3)] hover:bg-[var(--hover)]"
          >
            <X size={16} />
          </button>
        </div>

        <label className="block text-[11px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
          Phone number
        </label>
        <input
          type="tel"
          autoFocus
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="(555) 123-4567"
          className="w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 mb-3"
        />

        <label className="block text-[11px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
          Label <span className="text-[var(--t4)] normal-case">(optional)</span>
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          placeholder="e.g. flagship"
          className="w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
        />

        {error && <p className="mt-2 text-xs text-[var(--red)]">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={<Plus size={15} />} disabled={busy}>
            {busy ? 'Adding…' : 'Add number'}
          </Button>
        </div>
      </form>
    </div>
  )
}
