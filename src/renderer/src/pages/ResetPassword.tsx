import * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import {
  AuthShell,
  AuthField,
  authInputClass,
  authSubmitClass,
  authErrorClass
} from '@/components/AuthShell'

/**
 * Set a new password. Reached from a recovery link — AuthCallback has already
 * exchanged the one-time code, so there is a live session and updateUser() can
 * set the password directly.
 *
 * For an OAuth-only account this sets a password for the FIRST time. Supabase
 * adds an `email` identity alongside the existing `google` one rather than
 * replacing it, so both sign-in methods work afterwards.
 */
export function ResetPassword(): React.ReactElement {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) setError(error)
    else setDone(true)
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        subtitle="You can now sign in with your email and password, or continue with Google."
      >
        <button
          type="button"
          onClick={() => navigate('/profiles', { replace: true })}
          className={authSubmitClass}
        >
          Continue
        </button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Enter a new password for your account.">
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthField label="New password (8+ chars)">
          <input
            type="password"
            required
            minLength={8}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
          />
        </AuthField>
        {error && <div className={authErrorClass}>{error}</div>}
        <button type="submit" disabled={busy} className={authSubmitClass}>
          {busy ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </AuthShell>
  )
}
