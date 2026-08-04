import * as React from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import logo from '../assets/tubeghost-logo.png'
import { DOWNLOAD_URL } from '@/lib/desktop-app'

// Bridge page for the desktop OAuth handoff (see docs/desktop-oauth.md).
//
// The browser lands here after oauth-google-callback has exchanged the Google
// code and stored the id_token. All this page does is trigger the
// tubeghost:// deep link, which hands the sid to the desktop app; the desktop
// app then claims the token server-to-server. The sid alone is useless
// without the verifier, so it is safe in the URL bar.
//
// Reached by people who may have never opened the web app, so — like
// AuthCallback's shell — the dark theme is pinned rather than inherited from
// [data-theme] (a first-time visitor has no persisted tg-theme and would
// otherwise get the light default).
const SHELL: React.CSSProperties = {
  background: 'radial-gradient(130% 90% at 50% -10%, #1F2128 0%, #131418 60%)',
  color: '#f2f3f5'
}

/** Human-readable text for the error codes shared with the desktop app. */
function errorMessage(code: string): string {
  switch (code) {
    case 'access_denied':
      return 'Sign-in was cancelled.'
    case 'invalid_state':
      return 'This sign-in link is no longer valid. Start again from the app.'
    case 'expired':
      return 'This sign-in request expired. Start again from the app.'
    case 'exchange_failed':
      return "We couldn't complete sign-in with Google. Please try again."
    default:
      return 'Something went wrong during sign-in. Please try again from the app.'
  }
}

export function AuthClient(): React.ReactElement {
  const [params] = useSearchParams()
  const sid = params.get('sid')
  const error = params.get('error')
  const [showDownload, setShowDownload] = useState(false)

  // Build the deep link once; both the auto-redirect and the manual <a> use
  // the exact same URL so the fallback is a true retry.
  const deepLink = sid
    ? `tubeghost://auth/callback?${new URLSearchParams(
        error ? { error, sid } : { sid }
      ).toString()}`
    : null

  // Keep this page out of search results — it is a transient redirect target.
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

    // replace() rather than assign() so the deep link doesn't become a history
    // entry the back button can re-trigger.
    window.location.replace(deepLink)

    // If the app is installed, the OS takes focus and these never matter. If
    // it isn't, the page stays put and we surface the download hint.
    const closeTimer = setTimeout(() => {
      // Only works for script-opened windows; harmless no-op otherwise, which
      // is why the download line below is the real fallback.
      window.close()
    }, 2000)
    const downloadTimer = setTimeout(() => setShowDownload(true), 4000)

    return () => {
      clearTimeout(closeTimer)
      clearTimeout(downloadTimer)
    }
  }, [deepLink])

  // Stray visit with no sid — nothing to hand off.
  if (!sid) {
    return (
      <Shell>
        <p className="text-sm text-[#a8acb4] text-center max-w-sm">
          This page completes sign-in for the TubeGhost desktop app. Start sign-in from the app.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="text-center max-w-sm space-y-4">
        {error ? (
          <p className="text-sm text-[#ff6b6b]">{errorMessage(error)}</p>
        ) : (
          <p className="text-sm text-[#a8acb4]">Redirecting to TubeGhost…</p>
        )}

        {/* Plain anchor, same URL: some browsers suppress a scripted
            navigation to a custom scheme but allow a user-initiated one. */}
        <p className="text-xs text-[#a8acb4]">
          If you weren&apos;t redirected,{' '}
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

/** Centered, always-dark shell with the TubeGhost mark. No app chrome. */
function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-4"
      style={SHELL}
    >
      <img src={logo} alt="TubeGhost" width={40} height={40} style={{ objectFit: 'contain' }} />
      {children}
    </div>
  )
}
