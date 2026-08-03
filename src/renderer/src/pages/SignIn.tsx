import * as React from 'react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { stashPendingInvite, takePendingInvite } from '@/lib/pendingInvite'
import { GoogleButton } from '@/components/GoogleButton'
import {
  AuthShell,
  AuthDivider,
  AuthField,
  authInputClass,
  authSubmitClass,
  authErrorClass
} from '@/components/AuthShell'

export function SignIn(): React.ReactElement {
  const { user, signIn, signInWithGoogle, resendConfirmation } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resent, setResent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const { search } = useLocation()

  // Persist an in-flight invite token so it survives auth — including the
  // Google sign-in redirect, which drops URL params. Without this, a teammate
  // who signs in with Google lands on /profiles and the accept screen is never
  // reached (the InvitationBanner is the only fallback).
  useEffect(() => {
    const invite = new URLSearchParams(search).get('invite')
    if (invite) stashPendingInvite(invite)
  }, [search])

  // On successful auth, resume the invite accept flow if one was pending.
  if (user) {
    const invite = takePendingInvite()
    return <Navigate to={invite ? `/invite/${invite}` : '/profiles'} replace />
  }

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setUnconfirmed(false)
    setResent(false)
    setBusy(true)
    let result: { error?: string; unconfirmed?: boolean }
    try {
      result = await signIn(email.trim(), password)
    } catch {
      result = { error: 'Network error — check your connection and try again.' }
    }
    setBusy(false)
    if (result.error) {
      setError(result.error)
      setUnconfirmed(Boolean(result.unconfirmed))
    }
  }

  const onResend = async (): Promise<void> => {
    const { error } = await resendConfirmation(email.trim())
    if (error) setError(error)
    else setResent(true)
  }

  const onGoogle = async (): Promise<void> => {
    setError(null)
    setGoogleBusy(true)
    const { error } = await signInWithGoogle()
    setGoogleBusy(false)
    if (error) setError(error)
  }

  return (
    <AuthShell mode="signin" title="Welcome back" subtitle="Sign in to your TubeGhost workspace.">
      <GoogleButton onClick={onGoogle} busy={googleBusy} label="Continue with Google" />
      <AuthDivider />
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthField label="Work email">
          <input
            type="email"
            required
            autoFocus
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
          />
        </AuthField>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-[var(--t2)]">Password</label>
            <Link
              to="/forgot-password"
              className="text-xs font-[550] text-[var(--red)] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
          />
        </div>
        {error && <div className={authErrorClass}>{error}</div>}
        {unconfirmed && !resent && (
          <button
            type="button"
            onClick={onResend}
            className="text-[12.5px] font-semibold text-[var(--red)] hover:underline"
          >
            Resend confirmation email
          </button>
        )}
        {resent && (
          <div className="text-[12.5px] text-[var(--t2)]">
            Confirmation email sent — check your inbox.
          </div>
        )}
        <button type="submit" disabled={busy} className={authSubmitClass}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}
