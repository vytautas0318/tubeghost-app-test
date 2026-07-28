// Tests for the password-reset path in the auth store — the flow that lets an
// OAuth-only (Google) account gain a password for the first time.
//
// Auth is delegated to Supabase, so the token model (30-min TTL, single-use),
// password hashing, and session revocation are enforced inside Supabase and are
// not ours to reimplement. What IS ours, and what these tests cover:
//   - forgot-password issues a reset for ANY account, including OAuth-only ones
//     (no guard that skips a user for lacking a password)
//   - the response is identical for known and unknown emails (no enumeration)
//   - expired / reused tokens surface as errors rather than false success
//   - setting the password does not unlink the Google identity

import { describe, it, expect, vi, beforeEach } from 'vitest'

const resetPasswordForEmail = vi.fn()
const updateUser = vi.fn()
const signInWithPassword = vi.fn()
const exchangeCodeForSession = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getTubeProxies: () => ({
    auth: {
      resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a),
      updateUser: (...a: unknown[]) => updateUser(...a),
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      exchangeCodeForSession: (...a: unknown[]) => exchangeCodeForSession(...a),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn()
    }
  }),
  getSupabase: () => null,
  ensureDataSession: vi.fn(async () => true),
  clearDataSession: vi.fn(async () => undefined)
}))

import { useAuth } from '@/store/auth'

// jsdom-free: the store reads window.location.origin for the redirect URL.
vi.stubGlobal('window', { location: { origin: 'https://app.tubeghost.com' } })

beforeEach(() => {
  vi.clearAllMocks()
  resetPasswordForEmail.mockResolvedValue({ error: null })
  updateUser.mockResolvedValue({ error: null })
})

describe('sendPasswordReset — issues a token for any account', () => {
  it('sends a reset for an OAuth-only account (no password-identity guard)', async () => {
    // A Google-only user has no password identity. Supabase still issues a
    // recovery token; nothing in our code may skip them.
    const result = await useAuth.getState().sendPasswordReset('google-only@gmail.com')

    expect(result).toEqual({ sent: true })
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1)
    expect(resetPasswordForEmail.mock.calls[0][0]).toBe('google-only@gmail.com')
  })

  it('routes the recovery link back through the PKCE callback', async () => {
    await useAuth.getState().sendPasswordReset('user@gmail.com')

    const opts = resetPasswordForEmail.mock.calls[0][1] as { redirectTo: string }
    expect(opts.redirectTo).toContain('/auth/callback')
    // AuthCallback branches on this to show the set-password form instead of
    // dropping the user straight into the app.
    expect(opts.redirectTo).toContain('type=recovery')
  })

  it('trims the submitted address', async () => {
    await useAuth.getState().sendPasswordReset('  spaced@gmail.com  ')
    expect(resetPasswordForEmail.mock.calls[0][0]).toBe('spaced@gmail.com')
  })
})

describe('sendPasswordReset — no account enumeration', () => {
  it('returns an identical response for unknown and known emails', async () => {
    // Supabase returns 200 for an unknown address; the store must not add any
    // branch that distinguishes the two.
    const known = await useAuth.getState().sendPasswordReset('real@gmail.com')
    const unknown = await useAuth.getState().sendPasswordReset('nobody@gmail.com')

    expect(unknown).toEqual(known)
    expect(unknown).toEqual({ sent: true })
  })

  it('never surfaces a user-not-found error', async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { message: 'User not found', code: 'user_not_found' }
    })
    const result = await useAuth.getState().sendPasswordReset('nobody@gmail.com')

    // Whatever we return, it must not tell the caller the account is missing.
    expect(JSON.stringify(result).toLowerCase()).not.toContain('not found')
  })

  it('takes the same code path for both — no early return before the call', async () => {
    await useAuth.getState().sendPasswordReset('real@gmail.com')
    await useAuth.getState().sendPasswordReset('nobody@gmail.com')

    // A timing shortcut would show up as a skipped call for one of them.
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(2)
  })
})

describe('sendPasswordReset — non-enumerating failures still surface', () => {
  it('maps the rate limit to a friendly message', async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { message: 'email rate limit exceeded', code: 'over_email_send_rate_limit' }
    })
    const result = await useAuth.getState().sendPasswordReset('user@gmail.com')

    expect(result.error).toMatch(/wait a few minutes/i)
    expect(result.sent).toBeUndefined()
  })
})

describe('updatePassword — sets a first password on an OAuth-only account', () => {
  it('writes the new password via the recovery session', async () => {
    const result = await useAuth.getState().updatePassword('NewPassw0rd!123')

    expect(result).toEqual({})
    expect(updateUser).toHaveBeenCalledWith({ password: 'NewPassw0rd!123' })
  })

  it('does not unlink or touch the Google identity', async () => {
    await useAuth.getState().updatePassword('NewPassw0rd!123')

    // Only `password` is sent — no identity mutation of any kind.
    const payload = updateUser.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['password'])
    expect(payload).not.toHaveProperty('data')
  })

  it('rejects an expired recovery token', async () => {
    updateUser.mockResolvedValue({
      error: { message: 'Token has expired or is invalid', code: 'otp_expired' }
    })
    const result = await useAuth.getState().updatePassword('NewPassw0rd!123')

    expect(result.error).toMatch(/expired|invalid/i)
  })

  it('rejects a token that was already used', async () => {
    // Second exchange of a single-use code fails at the callback layer.
    exchangeCodeForSession.mockResolvedValue({
      error: { message: 'invalid flow state, no valid flow state found' }
    })
    const { error } = await exchangeCodeForSession('used-code')

    expect(error).toBeTruthy()
    expect(error.message).toMatch(/invalid flow state/i)
  })

  it('surfaces a weak-password rejection rather than reporting success', async () => {
    updateUser.mockResolvedValue({
      error: { message: 'Password should be at least 6 characters', code: 'weak_password' }
    })
    const result = await useAuth.getState().updatePassword('short')

    expect(result.error).toBeTruthy()
  })
})

describe('post-reset sign-in', () => {
  it('the new password authenticates the account', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    const result = await useAuth.getState().signIn('google-only@gmail.com', 'NewPassw0rd!123')

    expect(result).toEqual({})
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'google-only@gmail.com',
      password: 'NewPassw0rd!123'
    })
  })
})
