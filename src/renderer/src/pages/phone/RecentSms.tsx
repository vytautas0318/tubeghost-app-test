import * as React from 'react'
import { useState } from 'react'
import { Smartphone, Copy, Check } from 'lucide-react'
import { PlatformIcon } from '@/components/ui'
import type { Sms } from './phoneData'

// Right-hand live inbox: verification codes with one-tap copy.
export function RecentSms({
  inbox,
  onCopied
}: {
  inbox: Sms[]
  onCopied: (val: string) => void
}): React.ReactElement {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (val: string, key: string): void => {
    try {
      navigator.clipboard?.writeText(val)
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(key)
    onCopied(val)
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200)
  }

  return (
    <div className="phone-inbox">
      <div className="inbox-head">
        <span className="inbox-ic">
          <Smartphone size={17} />
        </span>
        <div>
          <div className="inbox-title">Recent SMS</div>
          <div className="inbox-sub">Codes arrive instantly</div>
        </div>
        <span className="inbox-live">
          <span className="inbox-dot" />
          Live
        </span>
      </div>
      <div className="inbox-list">
        {inbox.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)' }}>Inbox empty</div>
            <div style={{ fontSize: '12px', color: 'var(--t3)', marginTop: '4px' }}>
              Verification codes appear here the moment they arrive.
            </div>
          </div>
        )}
        {inbox.map((m) => (
          <div key={m.id} className="sms">
            <div className="sms-top">
              <span className="sms-from">
                <PlatformIcon platform={m.pl} size={22} />
                {m.from}
              </span>
              <span className="sms-time">{m.time}</span>
            </div>
            <div className="sms-body">{m.body}</div>
            <div className="sms-code" onClick={() => copy(m.code, m.id)}>
              <span className="sms-code-n">{m.code}</span>
              <span className="sms-copy">
                {copied === m.id ? <Check size={13} /> : <Copy size={13} />}
                {copied === m.id ? 'Copied' : 'Copy code'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
