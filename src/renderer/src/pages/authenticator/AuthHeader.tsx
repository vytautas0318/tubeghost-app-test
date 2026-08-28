import * as React from 'react'
import { Search, Smartphone, ChevronDown, ChevronRight, Plus, Lock } from 'lucide-react'
import { Button } from '@tubeghost/ui'
import { APP_STORE_URL, PLAY_STORE_URL } from './authData'
import { APPLE_ICON, ANDROID_ICON } from './appIcons'

// Page header row: live count subtitle, search, "Get the app" dropdown (§6),
// and the primary Add-account button (shown only with twofa.manage_tokens).
export function AuthHeader({
  count,
  q,
  setQ,
  getApp,
  setGetApp,
  canManage,
  onAdd,
  toast
}: {
  count: number
  q: string
  setQ: (v: string) => void
  getApp: boolean
  setGetApp: (v: boolean | ((p: boolean) => boolean)) => void
  canManage: boolean
  onAdd: () => void
  toast: (msg: string) => void
}): React.ReactElement {
  const openStore =
    (url: string, label: string) =>
    (e: React.MouseEvent): void => {
      e.preventDefault()
      setGetApp(false)
      toast(label)
      window.open(url, '_blank', 'noopener')
    }
  return (
    <div className="phead">
      <div>
        <h1>Authenticator</h1>
        <p>{count} two-factor codes · auto-filled on profile launch</p>
      </div>
      <div className="phead-actions">
        <div className="tb-search" style={{ width: '210px' }}>
          <Search size={14} />
          <input placeholder="Search accounts…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="getapp-wrap" onClick={(e) => e.stopPropagation()}>
          <Button
            icon={<Smartphone size={15} />}
            iconRight={<ChevronDown size={15} />}
            onClick={() => setGetApp((v) => !v)}
          >
            Get the app
          </Button>
          {getApp && (
            <div className="getapp-menu">
              <div className="getapp-head">TubeGhost Authenticator</div>
              <a
                className="getapp-item"
                href={APP_STORE_URL}
                onClick={openStore(APP_STORE_URL, 'Opening the App Store')}
              >
                <span className="getapp-ic">{APPLE_ICON}</span>
                <span>
                  <span className="getapp-k">Download for</span>
                  <span className="getapp-v">iPhone &amp; iPad</span>
                </span>
                <span className="getapp-go">
                  <ChevronRight size={14} />
                </span>
              </a>
              <a
                className="getapp-item"
                href={PLAY_STORE_URL}
                onClick={openStore(PLAY_STORE_URL, 'Opening Google Play')}
              >
                <span className="getapp-ic">{ANDROID_ICON}</span>
                <span>
                  <span className="getapp-k">Download for</span>
                  <span className="getapp-v">Android</span>
                </span>
                <span className="getapp-go">
                  <ChevronRight size={14} />
                </span>
              </a>
              <div className="getapp-foot">
                <Lock size={13} />
                Codes sync end-to-end encrypted
              </div>
            </div>
          )}
        </div>
        {canManage && (
          <Button variant="primary" icon={<Plus size={15} />} onClick={onAdd}>
            Add account
          </Button>
        )}
      </div>
    </div>
  )
}
