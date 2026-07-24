import * as React from 'react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { GoogleButton } from '@/components/GoogleButton'
import {
  AuthShell,
  AuthDivider,
  authInputClass,
  authSubmitClass,
  authErrorClass
} from '@/components/AuthShell'

// Basic RFC-5322-ish well-formedness check — non-empty, single @, a dot in
// the domain. The server is the real validator; this just gates the button.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SignIn(): React.ReactElement {
  const { user, signInWithMagicLink, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [sent, setSent] = useState(false)

  if (user) return <Navigate to="/profiles" replace />

  const emailValid = EMAIL_RE.test(email.trim())

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!emailValid) return
    setError(null)
    setBusy(true)
    let result: { error?: string; sent?: boolean }
    try {
      result = await signInWithMagicLink(email.trim())
    } catch {
      result = { error: 'Network error — check your connection and try again.' }
    }
    setBusy(false)
    if (result.error) setError(result.error)
    else if (result.sent) setSent(true)
  }

  const onGoogle = async (): Promise<void> => {
    setError(null)
    setGoogleBusy(true)
    const { error } = await signInWithGoogle()
    setGoogleBusy(false)
    if (error) setError(error)
  }

  // Confirmation state — replaces the form once the link is sent.
  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle={`We sent a sign-in link to ${email.trim()}.`}>
        <div className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] px-4 py-5 text-[13.5px] leading-[1.6] text-[var(--t2)]">
          Check your email for a sign-in link. Click it to finish signing in — you can close this
          window once you do.
        </div>
        <button
          type="button"
          onClick={() => {
            setSent(false)
            setError(null)
          }}
          className="mt-4 text-[13px] font-semibold text-[var(--t2)] hover:text-[var(--t1)] transition-colors"
        >
          Use a different email
        </button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your TubeGhost workspace.">
      <GoogleButton onClick={onGoogle} busy={googleBusy} label="Continue with Google" />
      <AuthDivider />
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          type="email"
          required
          autoFocus
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={authInputClass}
        />
        {error && <div className={authErrorClass}>{error}</div>}
        <button type="submit" disabled={busy || !emailValid} className={authSubmitClass}>
          {busy ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
    </AuthShell>
  )
}
