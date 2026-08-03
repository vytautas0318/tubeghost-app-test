import * as React from 'react'
import { useEffect, useState } from 'react'

// Desktop Google-sign-in callback bridge.
//
// The DESKTOP app opens a Supabase OAuth URL in the system browser with
// redirectTo = https://app.tubeghost.com/auth/callback-desktop. Google (via
// Supabase) redirects the browser HERE with a PKCE `?code` (or `?error`). This
// page does NOT exchange the code — the PKCE code_verifier lives in the desktop
// app's Supabase client, not this browser. It simply hands the code back to the
// app via the tubeghost://auth/callback?code=… deep link, where the app finishes
// with exchangeCodeForSession(code).
//
// Mirrors AuthClient.tsx (the Google-signin bridge for the old flow): fire the
// deep link on load, offer a manual retry + download fallback.
const SHELL: React.CSSProperties = {
  background: 'radial-gradient(130% 90% at 50% -10%, #1F2128 0%, #131418 60%)',
  color: '#f2f3f5'
}
const DOWNLOAD_URL = 'https://tubeghost.com/download'

export function AuthCallbackDesktop(): React.ReactElement {
  const [showDownload, setShowDownload] = useState(false)

  // Build the deep link from the current URL's code/error.
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error') ?? params.get('error_description')
  const deepLink = code
    ? `tubeghost://auth/callback?code=${encodeURIComponent(code)}`
    : error
      ? `tubeghost://auth/callback?error=${encodeURIComponent(error)}`
      : null

  // Keep this transient redirect page out of search results.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])

  useEffect(() => {
    if (!deepLink) return
    window.location.replace(deepLink)
    const downloadTimer = setTimeout(() => setShowDownload(true), 3500)
    return () => clearTimeout(downloadTimer)
  }, [deepLink])

  if (!code && !error) {
    return (
      <Shell>
        <p className="text-sm text-[#a8acb4] text-center max-w-sm">
          This page completes Google sign-in for the TubeGhost desktop app. Start sign-in from the
          app.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="text-center max-w-sm space-y-4">
        <p className="text-sm text-[#a8acb4]">
          {error ? 'Returning to TubeGhost…' : 'Completing sign-in…'}
        </p>
        <p className="text-xs text-[#a8acb4]">
          If TubeGhost didn&apos;t open,{' '}
          <a href={deepLink ?? '#'} className="underline text-[#f2f3f5]">
            click here
          </a>
          .
        </p>
        {showDownload && (
          <p className="text-xs text-[#7d828b]">
            Don&apos;t have the app?{' '}
            <a
              href={DOWNLOAD_URL}
              className="underline text-[#a8acb4]"
              target="_blank"
              rel="noreferrer"
            >
              Download TubeGhost
            </a>
            .
          </p>
        )}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-4"
      style={SHELL}
    >
      {children}
    </div>
  )
}
