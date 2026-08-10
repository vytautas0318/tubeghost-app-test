import * as React from 'react'
import { useState } from 'react'
import { Copy, Check, Send } from 'lucide-react'
import { roleIcon, roleTone } from './roleVisuals'
import { invitationLink } from '@/lib/invitations'
import type { MutateInvitationResult, ResendInvitationResult } from '@/lib/invitations'
import type { InvitationView } from './useInvitationsData'

// A pending invitation rendered as a greyed row inside the main members table
// (matches the redesign mockup: "?" avatar, email + "Invited Nd ago",
// "<Role> · pending" pill, dashes for counts, and a Revoke link at the end).
export function MemberInviteRow({
  inv,
  invitedRelative,
  canManage,
  onCopy,
  onResend,
  onRevoke
}: {
  inv: InvitationView
  invitedRelative: string
  canManage: boolean
  onCopy: (text: string) => void
  onResend: (id: string) => Promise<ResendInvitationResult>
  onRevoke: (id: string) => Promise<MutateInvitationResult>
}): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const copy = (): void => {
    onCopy(invitationLink(inv.token))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    await fn()
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

      <div className="invite-actions">
        {/* Always-visible copy-link action — this is the reliable way to get an
            invitee in when the email is delayed/filtered, so it must NOT be a
            faint hover-only icon (the old `.kebab` was opacity:0 until row
            hover, so users couldn't find it). Rendered as a labelled button. */}
        <button
          type="button"
          className="invite-btn"
          onClick={copy}
          title="Copy the invite link and share it directly"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {canManage && (
          <button
            type="button"
            className="invite-btn"
            disabled={busy}
            onClick={() => void run(() => onResend(inv.id))}
            title="Send the invitation email again with a fresh link"
          >
            <Send size={14} />
            Resend
          </button>
        )}
        {canManage && (
          <button
            type="button"
            className="invite-btn danger"
            disabled={busy}
            onClick={() => void run(() => onRevoke(inv.id))}
            title="Revoke invitation"
          >
            Revoke
          </button>
        )}
      </div>
    </div>
  )
}
