import * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '@/store/auth'
import { useWorkspace } from '@/store/workspace'
import { Button } from '@/components/ui'
import { acceptInvitation, validateInvitation, type InvitationValidation } from '@/lib/invitations'

type Phase = 'loading' | 'invalid' | 'ready' | 'need_auth' | 'accepting' | 'done' | 'error'

// Accept-invitation screen reached via the invitation deep link
// (tubeghost://invite/<token> → route /invite/:token). Works signed-out
// (routes to sign in, then returns here) and for members with no workspace yet.
export function AcceptInvite(): React.ReactElement {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const loadWorkspaces = useWorkspace((s) => s.load)
  const setCurrent = useWorkspace((s) => s.setCurrent)

  const [phase, setPhase] = useState<Phase>('loading')
  const [inv, setInv] = useState<InvitationValidation | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    validateInvitation(token)
      .then((v) => {
        if (cancelled) return
        if (!v) {
          setPhase('invalid')
          setMessage('This invitation link is not valid.')
          return
        }
        setInv(v)
        if (!v.is_valid) {
          setPhase('invalid')
          setMessage(
            v.status === 'accepted'
              ? 'This invitation has already been accepted.'
              : v.status === 'revoked'
                ? 'This invitation was revoked.'
                : 'This invitation has expired.'
          )
          return
        }
        setPhase(user ? 'ready' : 'need_auth')
      })
      .catch((e: Error) => {
        if (cancelled) return
        setPhase('error')
        setMessage(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [token, user])

  const accept = async (): Promise<void> => {
    setPhase('accepting')
    const r = await acceptInvitation(token)
    if (!r.ok) {
      setPhase('error')
      setMessage(
        r.reason === 'permission'
          ? 'This invitation was sent to a different email address. Sign in with the invited email.'
          : r.message || 'Could not accept the invitation.'
      )
      return
    }
    await loadWorkspaces()
    if (r.workspaceId) await setCurrent(r.workspaceId)
    setPhase('done')
    window.setTimeout(() => navigate('/profiles', { replace: true }), 900)
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-[var(--bg)]">
      <div className="max-w-md w-full bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow)] p-7 text-center">
        {phase === 'loading' && (
          <>
            <Loader2 className="w-7 h-7 mx-auto mb-3 animate-spin text-[var(--t3)]" />
            <p className="text-sm text-[var(--t2)]">Checking invitation…</p>
          </>
        )}

        {(phase === 'invalid' || phase === 'error') && (
          <>
            <ShieldAlert className="w-8 h-8 mx-auto mb-3 text-[var(--red)]" />
            <h2 className="text-base font-bold text-[var(--t1)] mb-1">Invitation unavailable</h2>
            <p className="text-sm text-[var(--t2)] mb-5">{message}</p>
            <Button onClick={() => navigate('/profiles', { replace: true })}>Go to app</Button>
          </>
        )}

        {(phase === 'ready' || phase === 'accepting') && inv && (
          <>
            <h2 className="text-lg font-bold text-[var(--t1)] mb-1">Join {inv.workspace_name}</h2>
            <p className="text-sm text-[var(--t2)] mb-1">
              You&apos;ve been invited as <b>{inv.role_name}</b>.
            </p>
            <p className="text-xs text-[var(--t3)] mb-5">
              Invitation for {inv.email} · expires{' '}
              {formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true })}
            </p>
            {inv.message && (
              <p className="text-sm text-[var(--t2)] italic border-l-2 border-[var(--line)] pl-3 mb-5 text-left">
                “{inv.message}”
              </p>
            )}
            <Button
              variant="primary"
              disabled={phase === 'accepting'}
              onClick={() => void accept()}
              style={{ width: '100%' }}
            >
              {phase === 'accepting' ? 'Joining…' : 'Join workspace'}
            </Button>
          </>
        )}

        {phase === 'need_auth' && inv && (
          <>
            <h2 className="text-lg font-bold text-[var(--t1)] mb-1">Join {inv.workspace_name}</h2>
            <p className="text-sm text-[var(--t2)] mb-5">
              Sign in or create an account with <b>{inv.email}</b> to accept this invitation.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="primary" onClick={() => navigate(`/signin?invite=${token}`)}>
                Sign in
              </Button>
              <Button onClick={() => navigate(`/signup?invite=${token}`)}>Create account</Button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-[var(--green)]" />
            <h2 className="text-base font-bold text-[var(--t1)] mb-1">You&apos;re in!</h2>
            <p className="text-sm text-[var(--t2)]">Taking you to your workspace…</p>
          </>
        )}
      </div>
    </div>
  )
}
