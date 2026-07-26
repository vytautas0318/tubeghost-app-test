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
  signUp: (
    email: string,
    password: string,
    workspaceName: string
  ) => Promise<{ error?: string; needsEmailConfirm?: boolean }>
  signInWithGoogle: () => Promise<{ error?: string }>
  // Passwordless magic-link sign-in. Sends a one-time sign-in link to the
  // given email. The session is not established here — it lands when the
  // user clicks the link (handled by the OAuth/deep-link callback +
  // onAuthStateChange), so the UI just shows a "check your email" state.
  signInWithMagicLink: (email: string) => Promise<{ error?: string; sent?: boolean }>
  resendConfirmation: (email: string) => Promise<{ error?: string; sent?: boolean }>
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
    // Establish the TP Browser data session (exchange) if already logged in.
    if (session) await ensureDataSession()

    supabase.auth.onAuthStateChange((event, newSession) => {
      set({ session: newSession, user: newSession?.user ?? null })
      // Keep the TP Browser data session in step with the identity session.
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
    // Establish the TP Browser data session before returning so the first
    // data query has a valid session (don't rely solely on the async
    // onAuthStateChange handler).
    await ensureDataSession()
    return {}
  },

  signUp: async (email, password, workspaceName) => {
    const supabase = getTubeProxies()
    if (!supabase) return { error: 'Supabase not configured' }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Signup happens on TubeProxies (the identity provider). The user's
      // TP Browser workspace is created shortly after by the mirror-user
      // edge function (DB webhook on TubeProxies profiles insert →
      // provision_mirrored_user). workspace_name is passed as metadata for
      // forward-compat; v1 provisioning defaults to "My Workspace".
      options: { data: { workspace_name: workspaceName } }
    })
    if (error) return { error: error.message }
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

  signInWithMagicLink: async (email) => {
    const supabase = getTubeProxies()
    if (!supabase) return { error: 'Supabase not configured' }
    // Reuse the same web callback route as Google OAuth. The magic link lands
    // on /auth/callback with a PKCE code; AuthCallback exchanges it, then
    // onAuthStateChange fires SIGNED_IN and ensureDataSession() runs.
    const emailRedirectTo = `${window.location.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo,
        // Register on first use (mirrors Google sign-in, which also creates the
        // user on first login). With single-project direct auth, most users
        // have no auth.users row yet — shouldCreateUser:false would silently
        // send nothing (Supabase returns no error but no email), so the UI
        // showed "check your email" for a link that was never sent.
        shouldCreateUser: true
      }
    })
    if (error) {
      const code = (error as { code?: string }).code
      if (code === 'over_email_send_rate_limit') {
        return { error: 'Too many requests — please wait a minute and try again.' }
      }
      return { error: error.message }
    }
    return { sent: true }
  },

  resendConfirmation: async (email) => {
    const supabase = getTubeProxies()
    if (!supabase) return { error: 'Supabase not configured' }
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    if (error) return { error: error.message }
    return { sent: true }
  },

  signOut: async (): Promise<void> => {
    await clearDataSession()
    const supabase = getTubeProxies()
    if (supabase) await supabase.auth.signOut()
  }
}))
