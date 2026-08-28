// Billing → Overview: stat cards, current plan (live meters), payment method.

import * as React from 'react'
import { CreditCard, Layers, Globe } from 'lucide-react'
import { Badge, Button, MetricCard } from '@tubeghost/ui'
import { money } from '@shared/pricing'
import { Meters, type MeterRow } from './Meters'
import { formatDate } from './currentPlan'
import { PaymentMethodCard } from './PaymentMethodCard'
import type { BillingState, PlanStatus } from './types'

const STATUS: Record<PlanStatus, { tone: 'green' | 'red' | 'neutral'; label: string }> = {
  active: { tone: 'green', label: 'Active' },
  trialing: { tone: 'green', label: 'Trial' },
  past_due: { tone: 'red', label: 'Past due' },
  canceled: { tone: 'neutral', label: 'Cancelled' },
  // Checkout started but never completed — no entitlement was granted.
  incomplete: { tone: 'neutral', label: 'Incomplete' }
}

/** "1 seat" / "3 seats" — the mock read "1 seats". */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function OverviewTab({
  billing,
  onUpgrade,
  onManageBilling,
  onAddPayment,
  onUpdatePayment,
  onRemovePayment,
  onSaveEmail
}: {
  billing: BillingState
  onUpgrade: () => void
  onManageBilling: () => void
  onAddPayment: () => void
  onUpdatePayment: () => void
  onRemovePayment: () => void
  onSaveEmail: (next: string) => void
}): React.ReactElement {
  const { plan, usage, paymentMethod, billingEmail } = billing
  const p = plan.data
  const u = usage.data
  const status = STATUS[p?.status ?? 'active']

  const rows: MeterRow[] = [
    { label: 'Profiles', used: u.profilesUsed, limit: u.profileLimit },
    { label: 'Team seats', used: u.seatsUsed, limit: u.seatLimit },
    // Not capped by plan — count only, no denominator, no fill.
    { label: 'Proxies', used: u.proxiesInPool, limit: null }
  ]

  return (
    <>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <MetricCard
          icon={<CreditCard size={16} />}
          tone="red"
          value={plan.loading ? '—' : money(p?.priceMonthly ?? 0)}
          unit="/mo"
          label={plan.error ? 'Plan unavailable' : `${p?.name ?? '—'} plan`}
        />
        <MetricCard
          icon={<Layers size={16} />}
          tone="blue"
          value={usage.loading || u.profilesUsed == null ? '—' : u.profilesUsed}
          unit={u.profileLimit != null ? `of ${u.profileLimit}` : undefined}
          label="Profiles used"
        />
        <MetricCard
          icon={<Globe size={16} />}
          tone="green"
          value={usage.loading || u.proxiesInPool == null ? '—' : u.proxiesInPool}
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
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>

          {plan.error ? (
            <div className="bill-err-inline" role="alert">
              Couldn&apos;t load your plan — {plan.error}
              <Button size="sm" onClick={billing.refresh}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="plan-card" style={{ marginBottom: '16px' }}>
              <div>
                <div className="plan-card-name">{plan.loading ? '—' : (p?.name ?? '—')}</div>
                <div className="plan-card-sub">
                  {p?.profileLimit != null && p?.seats != null
                    ? `${plural(p.profileLimit, 'profile')} · ${plural(p.seats, 'seat')}` +
                      (p.extraSeats > 0 ? ` (${p.extraSeats} extra)` : '')
                    : 'Plan limits'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="plan-card-price">
                  {money(p?.priceMonthly ?? 0)}
                  <small>/mo</small>
                </div>
                {p?.cycle !== 'monthly' && p?.cycle && (
                  <div className="plan-card-sub">
                    billed {p.cycle === 'annual' ? 'yearly' : p.cycle}
                  </div>
                )}
              </div>
            </div>
          )}

          {p?.currentPeriodEnd && (
            <p className="bill-period" role="note">
              {p.cancelAtPeriodEnd
                ? `Cancels on ${formatDate(p.currentPeriodEnd)} — you keep access until then.`
                : `Renews on ${formatDate(p.currentPeriodEnd)}.`}
            </p>
          )}

          {usage.error ? (
            <div className="bill-err-inline" role="alert">
              Couldn&apos;t count usage — {usage.error}
              <Button size="sm" onClick={billing.refresh}>
                Retry
              </Button>
            </div>
          ) : usage.loading ? (
            <div className="usage-block" aria-busy="true">
              {rows.map((r) => (
                <div className="usage-row" key={r.label}>
                  <div className="usage-top">
                    <span>{r.label}</span>
                    <span className="bill-skel-text" />
                  </div>
                  <div className="usage-bar bill-skel" />
                </div>
              ))}
            </div>
          ) : (
            <Meters rows={rows} />
          )}

          <div className="foot-btns">
            {/* No separate "Compare plans" button: the upgrade modal IS the
                comparison — it renders all three tiers side by side with the
                cycle toggles. A second button opening the same modal read as
                a neutral browse but landed the user in a purchase flow. */}
            <Button variant="primary" onClick={onUpgrade}>
              Upgrade plan
            </Button>
            {/* Stripe's hosted portal — the only route to cancellation, and
                where card changes and invoice downloads also live. Hidden on
                free, which has no Stripe customer to manage. */}
            {p?.id !== 'free' && <Button onClick={onManageBilling}>Manage billing</Button>}
          </div>
        </div>

        <div className="bill-side">
          <PaymentMethodCard
            method={paymentMethod}
            email={billingEmail}
            onAdd={onAddPayment}
            onUpdate={onUpdatePayment}
            onRemove={onRemovePayment}
            onSaveEmail={onSaveEmail}
          />
        </div>
      </div>
    </>
  )
}
