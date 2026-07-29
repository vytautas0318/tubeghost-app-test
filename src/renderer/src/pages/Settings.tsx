import * as React from 'react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { User, Fingerprint, Globe, Bell, Lock, CreditCard, Sparkles } from 'lucide-react'
import { ToastView, useToast } from '@/components/Toast'
import { GeneralPanel } from './settings/GeneralPanel'
import { FingerprintPanel } from './settings/FingerprintPanel'
import { NetworkPanel } from './settings/NetworkPanel'
import { NotificationsPanel } from './settings/NotificationsPanel'
import { SecurityPanel } from './settings/SecurityPanel'
import { BillingPanel } from './settings/BillingPanel'
import { ClaudePanel } from './settings/ClaudePanel'

const NAV: [string, React.ReactNode, string][] = [
  ['general', <User key="g" size={16} />, 'General'],
  ['fingerprint', <Fingerprint key="f" size={16} />, 'Fingerprint'],
  ['network', <Globe key="n" size={16} />, 'Network'],
  ['notifications', <Bell key="no" size={16} />, 'Notifications'],
  ['security', <Lock key="s" size={16} />, 'Security'],
  ['claude', <Sparkles key="c" size={16} />, 'Claude'],
  ['billing', <CreditCard key="b" size={16} />, 'Billing']
]

const TAB_IDS = new Set(NAV.map(([id]) => id))

export function Settings(): React.ReactElement {
  // Deep-linkable tab: /settings?tab=claude opens the Claude tab directly (e.g.
  // the desktop app links here to pair). Unknown/absent → General.
  const [params, setParams] = useSearchParams()
  const initialTab = params.get('tab')
  const [sn, setSn] = useState(initialTab && TAB_IDS.has(initialTab) ? initialTab : 'general')
  const { toast, show } = useToast()
  const t = (kind: 'success' | 'error' | 'info', msg: string): void => show(kind, msg)

  const selectTab = (id: string): void => {
    setSn(id)
    // Keep the URL in sync so a refresh/share stays on the same tab.
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', id)
      return next
    })
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Settings</h1>
            <p>Manage your workspace and browser defaults</p>
          </div>
        </div>

        <div className="set-grid">
          <nav className="set-nav">
            {NAV.map(([id, icon, label]) => (
              <div key={id} className={'sn' + (sn === id ? ' on' : '')} onClick={() => selectTab(id)}>
                {icon}
                {label}
              </div>
            ))}
          </nav>

          <div className="set-col">
            {sn === 'general' && <GeneralPanel onToast={t} />}
            {sn === 'fingerprint' && <FingerprintPanel onToast={t} />}
            {sn === 'network' && <NetworkPanel onToast={t} />}
            {sn === 'notifications' && <NotificationsPanel onToast={t} />}
            {sn === 'security' && <SecurityPanel onToast={t} />}
            {sn === 'claude' && <ClaudePanel onToast={t} />}
            {sn === 'billing' && <BillingPanel onToast={t} />}
          </div>
        </div>
      </div>
      <ToastView toast={toast} />
    </div>
  )
}
