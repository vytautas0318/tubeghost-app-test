import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { Button } from '@tubeghost/ui'
import { useBillingData } from '../billing/useBillingData'
import { UsageBars, type UsageRow } from '../billing/UsageBars'
import { type Toast } from './settingsCommon'

// Settings → Billing = the OVERVIEW. The standalone /billing route (pages/
// Billing.tsx) is the full page; both share useBillingData + UsageBars so
// plan/usage never drift. Payment method + invoices need a Stripe backend that
// isn't wired yet (no checkout/webhook edge function) — we render honest empty
// states with the integration seam marked, NOT sample $499/VISA data.
export function BillingPanel({ onToast }: { onToast: Toast }): React.ReactElement {
  const navigate = useNavigate()
  const workspace = useWorkspace((s) => s.current)
  const canManage = useHasPermission('billing.manage')
  const data = useBillingData(workspace?.workspace_id ?? null, workspace?.plan ?? null)

  const usage: UsageRow[] = [
    { label: 'Profiles', used: data.profileCount, limit: data.profileLimit },
    { label: 'Team seats', used: data.memberCount, limit: data.seatLimit },
    { label: 'Proxies', used: data.proxyCount, limit: null }
  ]

  return (
    <>
      <div className="sec">
        <div className="sec-t">Plan</div>
        <div className="sec-s">Your subscription and what it includes.</div>
        <div className="plan-card">
          <div>
            <div className="plan-card-name">
              {data.planName} <span className="plan-card-pill">Active</span>
            </div>
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
        <div className="foot-btns" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <Button variant="primary" onClick={() => navigate('/billing')}>
            Manage plan
          </Button>
          <Button onClick={() => navigate('/billing')}>View all plans</Button>
        </div>
      </div>

      <div className="sec">
        <div className="sec-t">Usage</div>
        <div className="sec-s">This billing period.</div>
        <UsageBars rows={usage} />
      </div>

      <div className="sec">
        <div className="sec-t">Payment method</div>
        <div className="sec-s">How your subscription is billed.</div>
        <div className="pay-card">
          <div style={{ flex: 1 }}>
            <div className="card-no">No payment method on file</div>
            <div className="card-exp">Added when you upgrade or buy add-ons</div>
          </div>
          <Button
            size="sm"
            disabled={!canManage}
            title={!canManage ? 'You don’t have billing permission' : undefined}
            onClick={() =>
              onToast(
                'info',
                'Payment methods are managed in the billing portal (Stripe integration pending).'
              )
            }
          >
            Add
          </Button>
        </div>
      </div>

      <div className="sec">
        <div className="sec-t">Invoices</div>
        <div className="sec-s">Receipts for the last 12 months.</div>
        <div style={{ padding: '28px 16px', textAlign: 'center' }}>
          <FileText size={20} style={{ margin: '0 auto 8px', color: 'var(--t4)' }} />
          <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--t1)' }}>
            No invoices yet
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--t3)', marginTop: '4px' }}>
            Receipts appear here after your first purchase.
          </div>
        </div>
      </div>
    </>
  )
}
