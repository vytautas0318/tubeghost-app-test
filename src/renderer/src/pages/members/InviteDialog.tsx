import * as React from 'react'
import { useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { emailSchema } from '@/lib/invitations'
import type { CreateInvitationResult, InviteInput } from '@/lib/invitations'
import type { AppRoleRow } from './types'

// Invite dialog: email + role + optional message. Client-side email
// validation mirrors the server (create_invitation RPC) for fast feedback.
export function InviteDialog({
  roles,
  onClose,
  onSubmit
}: {
  roles: AppRoleRow[]
  onClose: () => void
  onSubmit: (input: InviteInput) => Promise<CreateInvitationResult>
}): React.ReactElement {
  // Owner role is never assignable via invite.
  const assignable = roles.filter((r) => r.name !== 'Owner')
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState<string>(
    () => assignable.find((r) => r.name === 'Editor')?.id ?? assignable[0]?.id ?? ''
  )
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid email')
      return
    }
    if (!roleId) {
      setError('Pick a role')
      return
    }
    setBusy(true)
    const r = await onSubmit({ email: parsed.data, roleId, message: message.trim() || undefined })
    setBusy(false)
    if (!r.ok) {
      setError(
        r.reason === 'permission'
          ? 'You do not have permission to invite members.'
          : r.message || 'Failed to send invitation.'
      )
      return
    }
    onClose()
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
          <h3 className="text-base font-bold text-[var(--t1)]">Invite member</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--t3)] hover:bg-[var(--hover)]"
          >
            <X size={16} />
          </button>
        </div>

        <label className="block text-[11px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
          Email
        </label>
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 mb-3"
        />

        <label className="block text-[11px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
          Role
        </label>
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 mb-3"
        >
          {assignable.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <label className="block text-[11px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
          Message <span className="text-[var(--t4)] normal-case">(optional)</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Add a personal note…"
          className="w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 resize-none"
        />

        {error && <p className="mt-2 text-xs text-[var(--red)]">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={<UserPlus size={15} />} disabled={busy}>
            {busy ? 'Sending…' : 'Send invitation'}
          </Button>
        </div>
      </form>
    </div>
  )
}
