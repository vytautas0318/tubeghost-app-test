import * as React from 'react'
import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import type { AppRoleRow } from './types'

export function InviteForm({ roles }: { roles: AppRoleRow[] }): React.ReactElement {
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState<string>(() => {
    const operator = roles.find((r) => r.name === 'Operator')
    return operator?.id ?? roles[0]?.id ?? ''
  })

  useEffect(() => {
    if (!roleId && roles.length > 0) {
      const operator = roles.find((r) => r.name === 'Operator')
      setRoleId(operator?.id ?? roles[0].id)
    }
  }, [roles, roleId])

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    window.alert('Invite system coming in Phase 6.')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="px-6 py-3 border-b border-[var(--line)] flex items-end gap-2 bg-[var(--panel-2)]"
    >
      <div className="flex-1 max-w-md">
        <label className="block text-[10px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
          Invite by email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="w-full px-2.5 py-1.5 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-lg text-[var(--t1)] placeholder:text-[var(--t4)] dark:placeholder:text-night-muted focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
        />
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-[var(--t3)] mb-1 font-semibold">
          Role
        </label>
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="px-2 py-1.5 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
        >
          {roles
            .filter((r) => r.name !== 'Owner')
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </div>
      <button
        type="submit"
        className="px-3 py-1.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] flex items-center gap-1.5"
      >
        <UserPlus className="w-4 h-4" />
        Send invite
      </button>
    </form>
  )
}

export function PendingInvitesSection(): React.ReactElement {
  return (
    <div className="border-t border-[var(--line)] px-6 py-5 bg-[var(--panel-2)]">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--t3)] mb-2">
        Pending invites
      </h3>
      <div className="flex items-center gap-2 text-sm text-[var(--t3)]">
        <span>Invites coming soon — TODO: invite system (Phase 6).</span>
      </div>
    </div>
  )
}
