import * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { useWorkspace } from '@/store/workspace'
import { Button, Badge, MetricCard } from '@/components/ui'
import { ToastView, useToast } from '@/components/Toast'
import { useBillingData } from './billing/useBillingData'
import { useSubscriptions } from './billing/useSubscriptions'
import { PhoneTab, ProxiesTab } from './billing/AddonTabs'
import { InvoicesTab } from './billing/InvoicesTab'
import { UpgradeModal } from './billing/UpgradeModal'
import { openBillingPortal } from '@/lib/billing-api'

const TABS: [string, string][] = [
  ['overview', 'Overview'],
  ['proxies', 'Proxies'],
  ['phone', 'Phone numbers'],
  ['invoices', 'Invoices']
]

const card = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <rect x="2" y="6" width="20" height="13" rx="2.5" />
    <path d="M16 12h.01M2 10h20" />
  </svg>
)
const layers = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M3 9h18" />
  </svg>
)
const globe = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.4 2.5 3.6 5.7 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.7-3.6-9s1.2-6.5 3.6-9z" />
  </svg>
)

function pct(used: number, cap: number | null): number {
  if (!cap || cap <= 0) return 0
  return Math.min(100, Math.round((used / cap) * 100))
}

export function Billing(): React.ReactElement {
  const [tab, setTab] = useState('overview')
  const email = useAuth((s) => s.user?.email) ?? '—'
  const userId = useAuth((s) => s.user?.id) ?? null
  const workspace = useWorkspace((s) => s.current)
  const data = useBillingData(workspace?.workspace_id ?? null, workspace?.plan ?? null)
  // Live proxy + phone subscriptions from TubeProxies' tables (shared DB,
  // read-own RLS). Previously these tabs were hardcoded to [] and always
  // claimed "No active subscriptions" even for paying customers.
  const subs = useSubscriptions(userId)
  const navigate = useNavigate()
  const { toast, show } = useToast()

  /**
   * All subscription management — plan changes, cancellation, payment
   * methods, invoices — happens in Stripe's billing portal. The DB denies
   * user writes to these tables by policy, so there is nothing to edit
   * locally, and one portal covers both products' subscriptions.
   */
  const manageBilling = (): void => {
    openBillingPortal().catch((e: Error) => show('error', e.message))
  }

  const [upgrading, setUpgrading] = useState(false)

  // A workspace with no TubeGhost subscription has nothing for the Stripe
  // portal to manage — it needs the plan chooser. Once subscribed, plan
  // changes and cancellation belong in the portal, which handles proration.
  const hasPlan = workspace?.plan != null && workspace.plan !== 'free'
  const onUpgradeClick = (): void => {
    if (hasPlan) manageBilling()
    else setUpgrading(true)
  }

  const usage: { k: string; used: number; cap: number | null }[] = [
    { k: 'Profiles', used: data.profileCount, cap: data.profileLimit },
    { k: 'Team seats', used: data.memberCount, cap: data.seatLimit },
    { k: 'Proxies', used: data.proxyCount, cap: null }
  ]

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Billing</h1>
            <p>Manage your subscription, usage, and payment methods</p>
          </div>
          <div className="phead-actions">
            <Button variant="primary" onClick={onUpgradeClick}>
              {hasPlan ? 'Manage plan' : 'Choose a plan'}
            </Button>
          </div>
        </div>

        <div className="ext-tabs" style={{ marginBottom: '22px' }}>
          {TABS.map(([k, label]) => (
            <div key={k} className={'ext-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
              {label}
            </div>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <div className="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <MetricCard
                icon={card}
                tone="red"
                value={data.planPrice != null ? `$${data.planPrice}` : '$0'}
                unit="/mo"
                label={`${data.planName} plan`}
              />
              <MetricCard
                icon={layers}
                tone="blue"
                value={data.profileCount}
                unit={data.profileLimit ? `of ${data.profileLimit}` : undefined}
                label="Profiles used"
              />
              <MetricCard
                icon={globe}
                tone="green"
                value={data.proxyCount}
                label="Proxies in pool"
              />
            </div>
            <div className="bill-grid">
              <div className="sec">
                <div className="sec-row">
                  <div>
                    <div className="sec-t">Current plan</div>
                    <div className="sec-s">Usage counted live from this workspace.</div>
                  </div>
                  <Badge tone="green">Active</Badge>
                </div>
                <div className="plan-card" style={{ marginBottom: '16px' }}>
                  <div>
                    <div className="plan-card-name">{data.planName}</div>
                    <div className="plan-card-sub">
                      {data.profileLimit != null && data.seatLimit != null
                        ? `${data.profileLimit} profiles · ${data.seatLimit} seats`
                        : 'Plan limits'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="plan-card-price">
                      ${data.planPrice ?? 0}
                      <small>/mo</small>
                    </div>
                  </div>
                </div>
                <div className="usage-block">
                  {usage.map((u) => (
                    <div className="usage-row" key={u.k}>
                      <div className="usage-top">
                        <span>{u.k}</span>
                        <span>
                          <b>{u.used}</b>
                          {u.cap != null && <span className="cap"> / {u.cap}</span>}
                        </span>
                      </div>
                      <div className={'usage-bar' + (pct(u.used, u.cap) >= 90 ? ' warn' : '')}>
                        <i style={{ width: pct(u.used, u.cap) + '%' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="foot-btns">
                  <Button variant="primary" onClick={onUpgradeClick}>
                    {hasPlan ? 'Change plan' : 'Upgrade plan'}
                  </Button>
                  <Button onClick={() => setUpgrading(true)}>Compare plans</Button>
                </div>
              </div>
              <div className="bill-side">
                <div className="sec">
                  <div className="sec-t" style={{ marginBottom: '14px' }}>
                    Payment method
                  </div>
                  <div className="pay-card">
                    <div style={{ flex: 1 }}>
                      <div className="card-no">No payment method on file</div>
                      <div className="card-exp">Added when you upgrade or buy add-ons</div>
                    </div>
                    <Button size="sm" onClick={manageBilling}>
                      Add
                    </Button>
                  </div>
                  <div className="bill-contact">
                    <span className="bill-contact-k">Billing email</span>
                    <span className="bill-contact-v">{email}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'proxies' && (
          <ProxiesTab
            subs={subs}
            onBuy={() => navigate('/buy-proxies')}
            onManage={manageBilling}
          />
        )}

        {tab === 'phone' && (
          <PhoneTab subs={subs} onBuy={() => navigate('/phone')} onManage={manageBilling} />
        )}

        {tab === 'invoices' && <InvoicesTab onManage={manageBilling} />}
      </div>

      {upgrading && (
        <UpgradeModal
          usage={{ profilesUsed: data.profileCount, seatsUsed: data.memberCount }}
          workspaceId={workspace?.workspace_id ?? null}
          onClose={() => setUpgrading(false)}
        />
      )}
      <ToastView toast={toast} />
    </div>
  )
}
