// "This needs the desktop app" modal, shown when a web user triggers an
// action that only the local engine can perform (opening a browser profile).
//
// Deliberately explains WHY rather than just blocking: the profile's
// fingerprint + proxy are applied by a real Chromium running on the user's
// machine, which a browser tab can't do.

import * as React from 'react'
import { useEffect } from 'react'
import { Download, Monitor, X } from 'lucide-react'
import { Button } from '@tubeghost/ui'
import { DOWNLOAD_URL, desktopPlatformLabel } from '@/lib/desktop-app'

export function DesktopAppModal({
  // Name of the profile the user tried to open, shown as context.
  profileName,
  onClose
}: {
  profileName?: string | null
  onClose: () => void
}): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const os = desktopPlatformLabel()

  return (
    <div className="assign-scrim" onMouseDown={onClose}>
      <div
        className="assign-modal"
        style={{ maxWidth: '440px' }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Desktop app required"
      >
        <div className="assign-head">
          <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 'var(--r-sm)',
                background: 'var(--red-soft)',
                color: 'var(--red)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}
            >
              <Monitor size={16} />
            </span>
            <div>
              <div className="assign-title">Open in the desktop app</div>
              {profileName && <div className="assign-sub">{profileName}</div>}
            </div>
          </div>
          <button className="assign-x" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div style={{ padding: '0 16px 4px', fontSize: '13px', color: 'var(--t2)', lineHeight: 1.55 }}>
          Launching a profile starts a real anti-detect browser on your computer — it applies the
          fingerprint, routes traffic through the profile&apos;s proxy, and keeps the session local.
          A web page can&apos;t do that, so this action lives in the TubeGhost desktop app.
          <div style={{ marginTop: '10px', color: 'var(--t3)', fontSize: '12.5px' }}>
            Everything else — profiles, proxies, groups, members — stays editable here and syncs
            instantly.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '16px'
          }}
        >
          <Button size="sm" onClick={onClose}>
            Not now
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Download size={14} />}
            onClick={() => {
              window.open(DOWNLOAD_URL, '_blank', 'noopener')
              onClose()
            }}
          >
            Download for {os}
          </Button>
        </div>
      </div>
    </div>
  )
}
