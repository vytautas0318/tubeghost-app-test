import * as React from 'react'
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { GoogleButton } from '@/components/GoogleButton'
import {
  AuthShell,
  AuthDivider,
  AuthField,
  authInputClass,
  authSubmitClass,
  authErrorClass
} from '@/components/AuthShell'

export function SignUp(): React.ReactElement {
  const { user, signUp, signInWithGoogle } = useAuth()
  const [workspaceName, setWorkspaceName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)

  if (user) return <Navigate to="/profiles" replace />

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const result = await signUp(email.trim(), password, workspaceName.trim() || 'My Workspace')
    setBusy(false)
    if (result.error) {
      setError(result.error)
      setAlreadyRegistered(Boolean(result.alreadyRegistered))
      return
    }
    if (result.needsEmailConfirm) setConfirmSent(true)
  }

  const onGoogle = async (): Promise<void> => {
    setError(null)
    setGoogleBusy(true)
    const { error } = await signInWithGoogle()
    setGoogleBusy(false)
    if (error) setError(error)
    // For Google sign-up, the workspace name from the form is ignored — the
    // handle_new_user() trigger uses "My Workspace" as the default. Users can
    // rename it later in Settings.
  }

  if (confirmSent) {
    return (
      <AuthShell title="Check your email">
        <p className="text-sm text-[var(--t2)]">
          We sent a confirmation link to <strong>{email}</strong>. Click it to finish creating your
          account.
        </p>
        <Link
          to="/signin"
          className="block text-center text-xs text-[var(--red)] font-medium hover:underline mt-6"
        >
          Back to sign in
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      mode="signup"
      title="Create your workspace"
      subtitle="Create your workspace — no card required."
    >
      <GoogleButton onClick={onGoogle} busy={googleBusy} label="Continue with Google" />
      <AuthDivider />
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthField label="Workspace name">
          <input
            type="text"
            required
            autoFocus
            placeholder="e.g. Pletfree Creations"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            className={authInputClass}
          />
        </AuthField>
        <AuthField label="Work email">
          <input
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (alreadyRegistered) setAlreadyRegistered(false)
            }}
            className={authInputClass}
          />
        </AuthField>
        <AuthField label="Password (8+ chars)">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
          />
        </AuthField>
        {error && <div className={authErrorClass}>{error}</div>}
        {alreadyRegistered && (
          <Link
            to="/forgot-password"
            className="block text-[12.5px] font-semibold text-[var(--red)] hover:underline"
          >
            Set a password for this account →
          </Link>
        )}
        <button type="submit" disabled={busy} className={authSubmitClass}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="text-[11.5px] text-center text-[var(--t3)] mt-4 leading-relaxed">
        By continuing you agree to our{' '}
        <span className="text-[var(--red)] font-medium">Terms</span> and{' '}
        <span className="text-[var(--red)] font-medium">Privacy Policy</span>.
      </p>
    </AuthShell>
  )
}
