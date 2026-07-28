import * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '@/lib/supabase'
import { BrandLogo } from '@/components/BrandLogo'

// Web OAuth / email-confirmation callback. Google (or the confirmation link
// sent on signup) redirects the browser here with a PKCE `code` in the query
// string. We exchange it for a session, then route into the app. On failure we
// send the user back to sign-in with a message.
//
// The exchange must run EXACTLY ONCE: exchangeCodeForSession() consumes both
// the one-time `code` and the stored PKCE code_verifier, so a second call
// (e.g. React StrictMode double-invoking the effect in dev, or a component
// remount) fails with "invalid flow state, no valid flow state found". We
// guard with a module-level set keyed by the code.
const exchanged = new Set<string>()

export function AuthCallback(): React.ReactElement {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const supabase = getSupabase()
      if (!supabase) {
        setError('Supabase not configured')
        return
      }

      const params = new URLSearchParams(window.location.search)
      // Providers can return an error in the query (e.g. access_denied).
      const providerError = params.get('error_description') ?? params.get('error')
      if (providerError) {
        setError(providerError)
        return
      }
      const code = params.get('code')
      if (!code) {
        setError('No authorization code in callback URL')
        return
      }

      // Run-once guard: if this code was already exchanged (StrictMode second
      // pass), the first pass owns the outcome — just wait for its navigate.
      if (exchanged.has(code)) return
      exchanged.add(code)

      const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code)
      if (exchErr) {
        setError(exchErr.message)
        return
      }
      // A recovery link grants a session, but the user came here to set a
      // password — send them to the reset form instead of straight into the app.
      if (params.get('type') === 'recovery') {
        navigate('/reset-password', { replace: true })
        return
      }
      navigate('/profiles', { replace: true })
    })()
  }, [navigate])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg)] text-[var(--t1)]">
      <BrandLogo />
      {error ? (
        <>
          <p className="text-sm text-[var(--danger)]">Sign-in failed: {error}</p>
          <button
            className="text-sm underline text-[var(--t2)]"
            onClick={() => navigate('/signin', { replace: true })}
          >
            Back to sign in
          </button>
        </>
      ) : (
        <p className="text-sm text-[var(--t2)]">Completing sign-in…</p>
      )}
    </div>
  )
}
