import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
// Auth runs against this app's own Supabase project — the login session is
// also the data session (single client; see lib/supabase.ts).
import { getTubeProxies, ensureDataSession, clearDataSession } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean // true while we figure out whether the user is signed in (initial app load)
  initialized: boolean

  init: () => Promise<void>
  // `unconfirmed` is true when sign-in failed only because the email
  // hasn't been confirmed yet — lets the UI offer a resend action.
  signIn: (email: string, password: string) => Promise<{ error?: string; unconfirmed?: boolean }>
  // `alreadyRegistered` is true when the email is already taken — lets the UI
  // offer the "set a password instead" path rather than a dead-end error.
  signUp: (
    email: string,
    password: string,
    workspaceName: string
  ) => Promise<{ error?: string; needsEmailConfirm?: boolean; alreadyRegistered?: boolean }>
  signInWithGoogle: () => Promise<{ error?: string }>
  resendConfirmation: (email: string) => Promise<{ error?: string; sent?: boolean }>
  // Sends a password-reset email. Also the supported way to ADD a password to
  // an account that currently only has a Google identity: Supabase refuses to
  // attach a password identity via signUp() (it returns a decoy user with an
  // empty `identities` array), but the recovery link lets the user set one.
  // Afterwards BOTH Google and email+password sign-in work on the same user —
  // the Google identity is never unlinked.
  sendPasswordReset: (email: string) => Promise<{ error?: string; sent?: boolean }>
  // Sets a new password for the user in the current (recovery) session.
  // Supabase handles hashing, token single-use, and revoking other sessions.
  updatePassword: (password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,

  init: async (): Promise<void> => {
    const supabase = getTubeProxies()
    if (!supabase) {
      set({ loading: false, initialized: true })
      return
    }

    const {
      data: { session }
    } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, loading: false, initialized: true })
    // No-op since the single-project consolidation — login session IS the
    // data session. Kept so the call sites stay stable.
    if (session) await ensureDataSession()

    supabase.auth.onAuthStateChange((event, newSession) => {
      set({ session: newSession, user: newSession?.user ?? null })
      // Also no-ops; see ensureDataSession() in lib/supabase.ts.
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void ensureDataSession()
      } else if (event === 'SIGNED_OUT') {
        void clearDataSession()
      }
    })
  },

  signIn: async (email, password) => {
    const supabase = getTubeProxies()
    if (!supabase) return { error: 'Supabase not configured' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // Supabase returns code 'email_not_confirmed' when the account
      // exists + password is correct but the email is still unverified.
      // Surface a friendly message + a flag so the UI can offer "resend".
      const code = (error as { code?: string }).code
      if (code === 'email_not_confirmed') {
        return {
          error: 'Please confirm your email first — check your inbox for the confirmation link.',
          unconfirmed: true
        }
      }
      return { error: error.message }
    }
    // No-op (single project) — kept so the first data query after sign-in
    // has an explicit ordering point rather than relying solely on the async
    // onAuthStateChange handler.
    await ensureDataSession()
    return {}
  },

  signUp: async (email, password, workspaceName) => {
    const supabase = getTubeProxies()
    if (!supabase) return { error: 'Supabase not configured' }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // emailRedirectTo is REQUIRED on every call that sends an email. The
      // Supabase project is now shared with TubeProxies, whose Site URL is
      // https://dash.tubeproxies.com — without an explicit redirect a
      // TubeGhost confirmation link drops the user on the TubeProxies
      // dashboard. The origin must be in the project's Redirect URL
      // allowlist (https://app.tubeghost.com/** is configured).
      //
      // No ghost rows are created here. There is no signup trigger by
      // design, so TubeProxies customers who never open TubeGhost get no
      // ghost data; the workspace is created explicitly from the
      // NoWorkspace screen via create_workspace(). workspace_name rides
      // along as metadata for forward-compat.
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { workspace_name: workspaceName }
      }
    })
    if (error) {
      // Supabase's built-in SMTP is heavily rate-limited (a few messages per
      // hour, project-wide — not per address). Surface that as something the
      // user can act on rather than the raw server string.
      const code = (error as { code?: string }).code
      if (code === 'over_email_send_rate_limit') {
        return {
          error:
            'Too many confirmation emails sent recently. Please wait a few minutes and try again.'
        }
      }
      return { error: error.message }
    }
    // Supabase deliberately does NOT error when the email is already
    // registered — it returns 200 with an obfuscated user whose `identities`
    // array is empty, to prevent email enumeration. Without this check the UI
    // shows "check your email" for an account that was never created (and the
    // confirmation email is never sent).
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return {
        error:
          'An account with this email already exists. Sign in with Google, or use "Forgot password?" on the sign-in page to set a password for it.',
        alreadyRegistered: true
      }
    }
    // If the project requires email confirmation, session will be null.
    if (data.session === null) return { needsEmailConfirm: true }
    return {}
  },

  signInWithGoogle: async () => {
    const supabase = getTubeProxies()
    if (!supabase) return { error: 'Supabase not configured' }
    // Standard web OAuth against this app's own project: supabase-js redirects
    // the whole tab to Google, then Google redirects back to /auth/callback with
    // a PKCE `code`. The callback route (pages/AuthCallback.tsx) exchanges it for
    // a session. Because this navigates away, a successful call never returns
    // here — only errors do.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
    if (error) return { error: error.message }
    return {}
  },

  resendConfirmation: async (email) => {
    const supabase = getTubeProxies()
    if (!supabase) return { error: 'Supabase not configured' }
    // Same reason as signUp: the shared project's Site URL points at the
    // TubeProxies dashboard, so the redirect has to be explicit.
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    })
    if (error) return { error: error.message }
    return { sent: true }
  },

  sendPasswordReset: async (email) => {
    const supabase = getTubeProxies()
    if (!supabase) return { error: 'Supabase not configured' }
    // The recovery link lands on /auth/callback with a PKCE code, which
    // AuthCallback exchanges for a (recovery) session; ResetPassword then
    // calls updatePassword() to set the new password.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`
    })
    if (error) {
      const code = (error as { code?: string }).code
      // Only surface failures that are NOT account-specific. Anything else —
      // notably "user not found" — is swallowed and reported as success, so the
      // response is identical whether or not the address is registered.
      if (code === 'over_email_send_rate_limit') {
        return { error: 'Too many requests — please wait a few minutes and try again.' }
      }
      if (code === 'validation_failed') {
        return { error: 'Enter a valid email address.' }
      }
      return { sent: true }
    }
    return { sent: true }
  },

  updatePassword: async (password) => {
    const supabase = getTubeProxies()
    if (!supabase) return { error: 'Supabase not configured' }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { error: error.message }
    return {}
  },

  signOut: async (): Promise<void> => {
    await clearDataSession()
    const supabase = getTubeProxies()
    if (supabase) await supabase.auth.signOut()
  }
}))
