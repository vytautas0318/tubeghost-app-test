import * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTubeProxies, ensureDataSession } from '@/lib/supabase'
import { BrandLogo } from '@/components/BrandLogo'

// Web OAuth / magic-link callback. Google (or the email link) redirects the
// browser here with a PKCE `code` in the query string. We exchange it for a
// session on the identity client, establish the TP Browser data session, then
// route into the app. On failure we send the user back to sign-in with a
// message. Replaces the old Electron popup + window.api.auth.openOAuthWindow.
export function AuthCallback(): React.ReactElement {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const supabase = getTubeProxies()
      if (!supabase) {
        if (!cancelled) setError('Supabase not configured')
        return
      }

      const params = new URLSearchParams(window.location.search)
      // Providers can return an error in the query (e.g. access_denied).
      const providerError = params.get('error_description') ?? params.get('error')
      if (providerError) {
        if (!cancelled) setError(providerError)
        return
      }
      if (!params.get('code')) {
        if (!cancelled) setError('No authorization code in callback URL')
        return
      }

      const { error: exchErr } = await supabase.auth.exchangeCodeForSession(
        window.location.href
      )
      if (exchErr) {
        if (!cancelled) setError(exchErr.message)
        return
      }
      await ensureDataSession()
      if (!cancelled) navigate('/profiles', { replace: true })
    })()
    return () => {
      cancelled = true
    }
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
