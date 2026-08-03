import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Mail, X } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { useWorkspace } from '@/store/workspace'
import {
  acceptInvitationById,
  myPendingInvitations,
  type PendingInvitation
} from '@/lib/invitations'

// App-wide banner surfacing workspace invitations addressed to the signed-in
// user's email. This is the in-app counterpart to the tubeghost://invite/<token>
// deep link: it makes an invite acceptable even when the invitation email never
// arrived, or when the invitee signed up on their own first and landed in their
// own auto-created workspace (where nothing would otherwise hint at the invite).
//
// Sits beside PreviewBanner in the shell, above the sidebar + page area.
export function InvitationBanner(): React.ReactElement | null {
  const user = useAuth((s) => s.user)
  const loadWorkspaces = useWorkspace((s) => s.load)
  const setCurrent = useWorkspace((s) => s.setCurrent)

  const [invites, setInvites] = useState<PendingInvitation[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Dismissals are per-session only — an ignored invite reappears next launch
  // so it can't be lost, but stops nagging within the current session.
  const [dismissed, setDismissed] = useState<string[]>([])

  // Nonce-driven refetch + cancelled guard, matching useInvitationsData.
  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    // A failed lookup must never break the shell — the deep link still works.
    myPendingInvitations()
      .then((rows) => !cancelled && setInvites(rows))
      .catch(() => !cancelled && setInvites([]))
    return () => {
      cancelled = true
    }
  }, [user, nonce])

  const invite = invites.find((i) => !dismissed.includes(i.invitation_id))
  if (!invite) return null

  const accept = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const r = await acceptInvitationById(invite.invitation_id)
    if (!r.ok) {
      setBusy(false)
      setError(
        r.reason === 'permission'
          ? 'This invitation was sent to a different email address.'
          : r.message || 'Could not accept the invitation.'
      )
      return
    }
    // Mirror the AcceptInvite screen: pull the new workspace in and switch to it.
    await loadWorkspaces()
    if (r.workspaceId) await setCurrent(r.workspaceId)
    setBusy(false)
    refresh()
  }

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-[var(--red)] text-white text-xs font-medium shadow-md">
      <Mail className="h-3.5 w-3.5 shrink-0" />
      <span className="flex items-center gap-1.5">
        You&apos;ve been invited to
        <span className="px-2 py-0.5 rounded-full bg-white/20 font-bold">
          {invite.workspace_name}
        </span>
        as <b>{invite.role_name}</b>
        {error && <span className="opacity-90">— {error}</span>}
      </span>
      <button
        onClick={() => void accept()}
        disabled={busy}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 disabled:opacity-60 transition-colors text-[11px] font-semibold"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        {busy ? 'Joining…' : 'Join workspace'}
      </button>
      <button
        onClick={() => setDismissed((d) => [...d, invite.invitation_id])}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-white/20 transition-colors"
        title="Dismiss for now"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
