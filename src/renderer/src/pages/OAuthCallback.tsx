import * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Copy, Loader } from 'lucide-react'
import logo from '../assets/tubeghost-logo.png'

// This page is reached from an email link, by a visitor who may have never
// opened the web app — so there is no persisted `tpb-theme` and the DS token
// default is light (see store/theme.ts). Pin the shell dark the same way
// AuthShell pins its brand panel, rather than inheriting [data-theme].
const SHELL: React.CSSProperties = {
  background: 'radial-gradient(130% 90% at 50% -10%, #1F2128 0%, #131418 60%)',
  color: '#f2f3f5'
}

export function OAuthCallback(): React.ReactElement {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [showFallback, setShowFallback] = useState(false)
  const [copied, setCopied] = useState(false)

  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  useEffect(() => {
    if (code) {
      const deepLink = `tubeghost://auth?code=${encodeURIComponent(code)}`
      window.location.href = deepLink

      const timer = setTimeout(() => setShowFallback(true), 2500)
      return () => clearTimeout(timer)
    }
  }, [code])

  // clipboard.writeText rejects on insecure origins / denied permission — the
  // field is selectable either way, so a failure just means no "Copied!".
  const handleCopyCode = async (): Promise<void> => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      /* user can still select the field manually */
    }
  }

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  // Retry keeps the fallback visible: once the user has been shown the manual
  // code, hiding it again behind another 2.5s spinner takes away the thing they
  // came here to copy.
  const handleRetryDeepLink = () => {
    if (code) window.location.href = `tubeghost://auth?code=${encodeURIComponent(code)}`
  }

  const handleBackToSignIn = () => {
    navigate('/signin', { replace: true })
  }

  const formatErrorMessage = (): string => {
    const desc = errorDescription || error
    if (!desc) return 'Sign-in failed. Request a new link from the app.'

    if (error === 'otp_expired' || desc.includes('expired')) {
      return 'This link has expired — request a new one from the app.'
    }
    if (error === 'access_denied' || desc.includes('denied')) {
      return 'Sign-in was denied. Request a new link from the app.'
    }
    return desc
  }

  // No code or error: stray visit
  if (!code && !error) {
    return (
      <Shell>
        <div className="text-center max-w-sm">
          <p className="text-sm text-[#a8acb4] mb-6">
            This page is used for signing in with your TubeGhost account.
          </p>
          <Button variant="primary" onClick={handleBackToSignIn}>
            Go to sign in
          </Button>
        </div>
      </Shell>
    )
  }

  // Error path
  if (error) {
    return (
      <Shell>
        <div className="text-center max-w-sm">
          <p className="text-sm text-[var(--red)] mb-6">{formatErrorMessage()}</p>
          <Button variant="primary" onClick={handleBackToSignIn}>
            Back to sign in
          </Button>
        </div>
      </Shell>
    )
  }

  // Success path: code present
  return (
    <Shell>
      {!showFallback ? (
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <Loader size={20} className="animate-spin text-[var(--red)]" />
          </div>
          <p className="text-sm text-[#a8acb4]">Opening TubeGhost…</p>
        </div>
      ) : (
        <div className="text-center max-w-sm space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-white mb-2">Can&apos;t open the app?</h2>
            <p className="text-xs text-[#a8acb4] mb-4">
              Paste this code into &ldquo;Enter code manually&rdquo; on the app&apos;s sign-in screen.
            </p>
          </div>

          <div className="space-y-3">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                height: '40px',
                padding: '0 13px',
                borderRadius: 'var(--r)',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid #2e3036'
              }}
            >
              <input
                type="text"
                value={code || ''}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'none',
                  fontSize: '13px',
                  fontFamily: 'var(--mono)',
                  color: '#f2f3f5',
                  width: '100%',
                  textOverflow: 'ellipsis'
                }}
              />
              <button
                onClick={() => void handleCopyCode()}
                aria-label={copied ? 'Code copied' : 'Copy code'}
                title={copied ? 'Copied!' : 'Copy code'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '15px',
                  height: '15px',
                  color: copied ? 'var(--red)' : '#a8acb4',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  flexShrink: 0,
                  transition: 'color 0.2s'
                }}
              >
                <Copy size={15} />
              </button>
            </div>
            <p
              className="text-xs font-medium text-[var(--red)]"
              style={{ visibility: copied ? 'visible' : 'hidden' }}
              aria-live="polite"
            >
              Copied!
            </p>
          </div>

          <Button variant="primary" onClick={handleRetryDeepLink} style={{ width: '100%' }}>
            Open TubeGhost
          </Button>
        </div>
      )}
    </Shell>
  )
}

/** Centered, always-dark shell with the TubeGhost mark. */
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
