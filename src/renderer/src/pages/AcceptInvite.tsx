import * as React from 'react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { DOWNLOAD_URL } from '@/lib/desktop-app'

// Web landing page for the invitation email button
// (https://app.tubeghost.com/invite/<token>). Its ONE job is to hand the token
// to the desktop app via the tubeghost://invite/<token> deep link — the exact
// same target as the app's "Copy link" button — so clicking the email button
// opens TubeGhost on the invitee's machine. Mirrors AuthClient.tsx (the Google
// sign-in bridge): fire the deep link on load, offer a manual retry + download
// fallback if the app isn't installed. No in-browser accept flow anymore.

const SHELL: React.CSSProperties = {
  background: 'radial-gradient(130% 90% at 50% -10%, #1F2128 0%, #131418 60%)',
  color: '#f2f3f5'
}

export function AcceptInvite(): React.ReactElement {
  const { token = '' } = useParams()
  const [showDownload, setShowDownload] = useState(false)

  // Same URL the desktop "Copy link" button produces.
  const deepLink = token ? `tubeghost://invite/${token}` : null

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
    // replace() (not assign()) so the deep link isn't a back-button history entry.
    window.location.replace(deepLink)
    // If the app is installed, the OS takes focus and the timers never matter.
    // If not, the page stays and we surface the download hint.
    const downloadTimer = setTimeout(() => setShowDownload(true), 3500)
    return () => clearTimeout(downloadTimer)
  }, [deepLink])

  if (!token) {
    return (
      <Shell>
        <p className="text-sm text-[#a8acb4] text-center max-w-sm">
          This invitation link is missing its token. Open the link from your invitation email.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="text-center max-w-sm space-y-4">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-[#a8acb4]" />
        <p className="text-sm text-[#a8acb4]">Opening TubeGhost…</p>

        {/* A user-initiated click succeeds in browsers that suppress a scripted
            navigation to a custom scheme. */}
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

/** Centered, always-dark shell with the TubeGhost mark. No app chrome. */
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
