// "This profile's proxy has expired" modal, shown when a user tries to open
// a profile whose assigned proxy is no longer active.
//
// Why this exists (decision 2026-08-04): an expired proxy is NOT unassigned
// from its profile — Julian: "So it's no longer connected to the profile? I
// think that's inconvenient for the user". The assignment is kept so the
// profile is ready the moment the plan is renewed. The trade-off is that the
// profile would otherwise fail to connect with no explanation, so the nudge
// happens at the point of use: "We can make a pop up when they open a profile
// with an expired proxy to nudge them to continue their plan."
//
// Deliberately not a hard block. The user can still proceed — they may have
// a reason, and silently refusing to open their own profile is worse than
// telling them what will happen.

import * as React from 'react'
import { useEffect } from 'react'
import { AlertTriangle, ExternalLink, X } from 'lucide-react'
import { Button } from '@tubeghost/ui'

const RENEW_URL = 'https://dash.tubeproxies.com/billing'

export function ExpiredProxyModal({
  profileName,
  // host:port of the lapsed proxy, so the user can tell which one it is
  // without hunting through the Proxies page.
  proxyLabel,
  onClose,
  onContinue
}: {
  profileName?: string | null
  proxyLabel?: string | null
  onClose: () => void
  onContinue?: () => void
}): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="assign-scrim" onMouseDown={onClose}>
      <div
        className="assign-modal"
        style={{ maxWidth: '440px' }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Proxy expired"
      >
        <div className="assign-head">
          <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 'var(--r-sm)',
                background: 'var(--amber-soft, var(--panel-2))',
                color: 'var(--amber)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}
            >
              <AlertTriangle size={16} />
            </span>
            <div>
              <div className="assign-title">This profile&apos;s proxy has expired</div>
              {profileName && <div className="assign-sub">{profileName}</div>}
            </div>
          </div>
          <button className="assign-x" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          style={{ padding: '0 16px 4px', fontSize: '13px', color: 'var(--t2)', lineHeight: 1.55 }}
        >
          {proxyLabel ? (
            <>
              <span className="mono">{proxyLabel}</span> is no longer active, so this profile
              won&apos;t be able to connect through it.
            </>
          ) : (
            <>The proxy assigned to this profile is no longer active, so it won&apos;t connect.</>
          )}
          <div style={{ marginTop: '10px', color: 'var(--t3)', fontSize: '12.5px' }}>
            The proxy stays assigned and nothing is lost — renew your plan and this profile works
            again straight away. You can also assign a different proxy from the Proxies page.
          </div>
        </div>

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px' }}
        >
          {onContinue && (
            <Button size="sm" onClick={onContinue}>
              Open anyway
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            icon={<ExternalLink size={14} />}
            onClick={() => {
              window.open(RENEW_URL, '_blank', 'noopener')
              onClose()
            }}
          >
            Renew plan
          </Button>
        </div>
      </div>
    </div>
  )
}
