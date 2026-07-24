import * as React from 'react'
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { roleIcon, roleTone } from './roleVisuals'
import { invitationLink } from '@/lib/invitations'
import type { MutateInvitationResult } from '@/lib/invitations'
import type { InvitationView } from './useInvitationsData'

// A pending invitation rendered as a greyed row inside the main members table
// (matches the redesign mockup: "?" avatar, email + "Invited Nd ago",
// "<Role> · pending" pill, dashes for counts, and a Revoke link at the end).
export function MemberInviteRow({
  inv,
  invitedRelative,
  canManage,
  onCopy,
  onRevoke
}: {
  inv: InvitationView
  invitedRelative: string
  canManage: boolean
  onCopy: (text: string) => void
  onRevoke: (id: string) => Promise<MutateInvitationResult>
}): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const copy = (): void => {
    onCopy(invitationLink(inv.token))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const revoke = async (): Promise<void> => {
    setBusy(true)
    await onRevoke(inv.id)
    setBusy(false)
  }

  return (
    <div className="mrow" style={{ opacity: 0.72 }}>
      <div className="muser">
        <span className="invite-avatar" aria-hidden="true">
          ?
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="mname" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {inv.email}
          </div>
          <div className="memail">Invited {invitedRelative}</div>
        </div>
      </div>

      <div>
        <span className={'role ' + roleTone(inv.roleName)} style={{ opacity: 0.9 }}>
          {roleIcon(inv.roleName)}
          {inv.roleName} · pending
        </span>
      </div>

      <div className="mstat" style={{ color: 'var(--t4)' }}>
        —
      </div>
      <div className="mstat" style={{ color: 'var(--t4)' }}>
        —
      </div>

      <div className="mseen" />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2, alignItems: 'center' }}>
        <button
          title="Copy invitation link"
          className="kebab"
          style={{ opacity: 1 }}
          onClick={copy}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
        {canManage && (
          <button
            className="invite-revoke"
            disabled={busy}
            onClick={() => void revoke()}
            title="Revoke invitation"
          >
            Revoke
          </button>
        )}
      </div>
    </div>
  )
}
