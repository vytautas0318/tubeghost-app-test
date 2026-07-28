import * as React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import {
  AuthShell,
  AuthField,
  authInputClass,
  authSubmitClass,
  authErrorClass
} from '@/components/AuthShell'

/**
 * Forgot password — sends a recovery link.
 *
 * Doubles as the "add a password to my Google account" path: Supabase won't
 * attach a password identity via signUp(), but a recovery link lets the user
 * set one. Afterwards both Google and email+password sign-in work on the same
 * user; the Google identity is never unlinked.
 *
 * No account enumeration: the confirmation screen is shown for ANY well-formed
 * email, whether or not it resolves to an account.
 */
export function ForgotPassword(): React.ReactElement {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    let result: { error?: string; sent?: boolean }
    try {
      result = await sendPasswordReset(email.trim())
    } catch {
      result = { error: 'Network error — check your connection and try again.' }
    }
    setBusy(false)
    // Only genuinely non-account-specific failures (rate limit, network, config)
    // surface as errors — an unknown address still lands on the sent screen.
    if (result.error) setError(result.error)
    else setSent(true)
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`If an account exists for ${email.trim()}, we've sent a reset link.`}
      >
        <div className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--panel)] px-4 py-5 text-[13.5px] leading-[1.6] text-[var(--t2)]">
          Click the link in that email to choose a new password. If you signed up with Google, this
          adds a password to your existing account — you&apos;ll still be able to use Continue with
          Google.
        </div>
        <Link
          to="/signin"
          className="block mt-4 text-[13px] font-semibold text-[var(--t2)] hover:text-[var(--t1)] transition-colors"
        >
          Back to sign in
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to set a new password.">
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
        {error && <div className={authErrorClass}>{error}</div>}
        <button type="submit" disabled={busy} className={authSubmitClass}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <Link
        to="/signin"
        className="block text-center mt-4 text-[13px] font-semibold text-[var(--t2)] hover:text-[var(--t1)] transition-colors"
      >
        Back to sign in
      </Link>
    </AuthShell>
  )
}
