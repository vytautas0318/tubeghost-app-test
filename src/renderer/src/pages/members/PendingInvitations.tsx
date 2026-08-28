import * as React from 'react'
import { useState } from 'react'
import { Check, Copy, Link2, RefreshCw, Send, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@tubeghost/ui'
import { invitationLink, undeliveredMessage } from '@/lib/invitations'
import type { MutateInvitationResult, ResendInvitationResult } from '@/lib/invitations'
import type { InvitationView } from './useInvitationsData'

function StatusChip({ inv }: { inv: InvitationView }): React.ReactElement {
  if (inv.status === 'accepted') return <Badge tone="green">Accepted</Badge>
  if (inv.status === 'revoked') return <Badge tone="red">Revoked</Badge>
  if (inv.status === 'expired' || inv.isExpired) return <Badge tone="neutral">Expired</Badge>
  return <Badge tone="amber">Pending</Badge>
}

// Pending / historical invitations with resend, copy-link and revoke actions.
export function PendingInvitations({
  invitations,
  canManage,
  onResend,
  onRevoke,
  onNotify
}: {
  invitations: InvitationView[]
  canManage: boolean
  onResend: (id: string) => Promise<ResendInvitationResult>
  onRevoke: (id: string) => Promise<MutateInvitationResult>
  onNotify: (kind: 'success' | 'error' | 'info', text: string) => void
}): React.ReactElement | null {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  if (invitations.length === 0) return null

  const copyLink = async (inv: InvitationView): Promise<void> => {
    try {
      await navigator.clipboard.writeText(invitationLink(inv.token))
      setCopiedId(inv.id)
      window.setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 1500)
    } catch {
      onNotify('error', 'Could not copy the invitation link.')
    }
  }

  const run = async (
    id: string,
    fn: (id: string) => Promise<MutateInvitationResult>,
    okMsg: string
  ): Promise<void> => {
    setBusyId(id)
    const r = await fn(id)
    setBusyId(null)
    onNotify(
      r.ok ? 'success' : 'error',
      r.ok
        ? okMsg
        : r.reason === 'permission'
          ? 'You do not have permission to manage invitations.'
          : r.message || 'Action failed.'
    )
  }

  // Resend is delivery-aware: report whether the email actually went out, and
  // on failure nudge toward the copy-link fallback (the invite row still has a
  // fresh valid link).
  const runResend = async (id: string): Promise<void> => {
    setBusyId(id)
    const r = await onResend(id)
    setBusyId(null)
    if (!r.ok) {
      onNotify(
        'error',
        r.reason === 'permission'
          ? 'You do not have permission to manage invitations.'
          : r.message || 'Resend failed.'
      )
      return
    }
    if (r.delivery === 'sent') {
      onNotify('success', 'Invitation email resent.')
    } else {
      onNotify('info', undeliveredMessage(r.invitation.email, r.deliveryReason))
    }
  }

  return (
    <div className="mtable" style={{ marginTop: 18 }}>
      <div className="mhead" style={{ gridTemplateColumns: '2fr 1fr 1fr 1.2fr auto', height: 42 }}>
        <div className="th">Invitation</div>
        <div className="th">Role</div>
        <div className="th">Status</div>
        <div className="th">Expires</div>
        <div className="th" style={{ justifyContent: 'flex-end' }}>
          Actions
        </div>
      </div>
      {invitations.map((inv) => {
        const isPending = inv.status === 'pending' && !inv.isExpired
        return (
          <div
            key={inv.id}
            className="mrow"
            style={{ gridTemplateColumns: '2fr 1fr 1fr 1.2fr auto', height: 56 }}
          >
            <div className="mname" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {inv.email}
            </div>
            <div>
              <span className="role member">{inv.roleName}</span>
            </div>
            <div>
              <StatusChip inv={inv} />
            </div>
            <div className="mseen">
              {isPending ? formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true }) : '—'}
            </div>
            <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              {isPending && (
                <button
                  title="Copy invitation link"
                  className="kebab"
                  style={{ opacity: 1 }}
                  onClick={() => void copyLink(inv)}
                >
                  {copiedId === inv.id ? <Check size={15} /> : <Copy size={15} />}
                </button>
              )}
              {canManage &&
                (inv.status === 'pending' || inv.status === 'expired' || inv.isExpired) && (
                  <button
                    title="Resend (new link + expiry)"
                    className="kebab"
                    style={{ opacity: 1 }}
                    disabled={busyId === inv.id}
                    onClick={() => void runResend(inv.id)}
                  >
                    {inv.status === 'expired' || inv.isExpired ? (
                      <RefreshCw size={15} />
                    ) : (
                      <Send size={15} />
                    )}
                  </button>
                )}
              {canManage && isPending && (
                <button
                  title="Revoke invitation"
                  className="kebab"
                  style={{ opacity: 1 }}
                  disabled={busyId === inv.id}
                  onClick={() => void run(inv.id, onRevoke, 'Invitation revoked.')}
                >
                  <X size={15} />
                </button>
              )}
              {!isPending && !canManage && <Link2 size={14} style={{ opacity: 0.3 }} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
