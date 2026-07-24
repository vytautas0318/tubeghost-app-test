import * as React from 'react'
import { useState } from 'react'
import { User, Fingerprint, Globe, Bell, Lock, CreditCard } from 'lucide-react'
import { ToastView, useToast } from '@/components/Toast'
import { GeneralPanel } from './settings/GeneralPanel'
import { FingerprintPanel } from './settings/FingerprintPanel'
import { NetworkPanel } from './settings/NetworkPanel'
import { NotificationsPanel } from './settings/NotificationsPanel'
import { SecurityPanel } from './settings/SecurityPanel'
import { BillingPanel } from './settings/BillingPanel'

const NAV: [string, React.ReactNode, string][] = [
  ['general', <User key="g" size={16} />, 'General'],
  ['fingerprint', <Fingerprint key="f" size={16} />, 'Fingerprint'],
  ['network', <Globe key="n" size={16} />, 'Network'],
  ['notifications', <Bell key="no" size={16} />, 'Notifications'],
  ['security', <Lock key="s" size={16} />, 'Security'],
  ['billing', <CreditCard key="b" size={16} />, 'Billing']
]

export function Settings(): React.ReactElement {
  const [sn, setSn] = useState('general')
  const { toast, show } = useToast()
  const t = (kind: 'success' | 'error' | 'info', msg: string): void => show(kind, msg)

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
              <div key={id} className={'sn' + (sn === id ? ' on' : '')} onClick={() => setSn(id)}>
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
            {sn === 'billing' && <BillingPanel onToast={t} />}
          </div>
        </div>
      </div>
      <ToastView toast={toast} />
    </div>
  )
}
