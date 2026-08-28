import * as React from 'react'
import { useState } from 'react'
import {
  PHONE_DASHBOARD_URL,
  PhoneCheckoutRefused,
  startPhoneCheckout,
  type PhoneBillingPeriod
} from './phoneCheckout'
import { Check } from 'lucide-react'
import { PoweredByTubeProxies } from '@/components/PoweredByTubeProxies'
import { Flag } from '@/components/Flag'
import { openPhonePurchase } from '@/lib/phoneNumbers'
import { PHONE_TIERS } from '@shared/phone-plans'
import { ADDON_CYCLE_MULT } from '@shared/pricing'
import { phoneTileAction, type PhoneTileState } from './phoneTileAction'
import type { PhoneSubscription } from '@/lib/phoneNumbers'

/** Terms offered, in the same order as every other pricing surface. */
const PHONE_TERMS: [PhoneBillingPeriod, string, string][] = [
  ['monthly', 'Monthly', ''],
  ['quarterly', 'Quarterly', 'Save 10%'],
  ['annual', 'Annual', 'Save 20%']
]

/**
 * The phone-number price ladder.
 *
 * Shown full-page when the user has no numbers (so the first thing they see
 * is the price, not an empty table), and as a "buy more" section once they
 * do. TubeProxies bills and provisions these — every CTA hands off to its
 * checkout.
 */
export function PhonePricing({
  compact = false,
  onError,
  subscription = null,
  onChangePlan
}: {
  /** Tighter heading + no footer, for embedding under an existing table. */
  compact?: boolean
  /** Surfaces a refusal ("you already have a subscription") to the page toast. */
  onError?: (message: string) => void
  /**
   * The buyer's active phone subscription, when they have one. Drives the tile
   * labels: without it every tile reads "Get numbers" even for an existing
   * customer, which is why changing quantity used to be impossible in-app.
   */
  subscription?: PhoneSubscription | null
  /**
   * Opens the in-app change flow (preview -> confirm -> commit). Absent means
   * the flag is off and the tiles fall back to the dashboard hand-off.
   */
  onChangePlan?: (quantity: number, period: PhoneBillingPeriod) => void
}): React.ReactElement {
  const [term, setTerm] = useState<PhoneBillingPeriod>('quarterly')
  const [busy, setBusy] = useState<number | null>(null)
  const mult = ADDON_CYCLE_MULT[term]

  // No stripe_price_id on the overview row, so the cycle is recovered from the
  // billing period — the same fallback the server classifier carries.
  const current: PhoneTileState | null = subscription
    ? {
        quantity: subscription.number_quantity,
        periodStart: subscription.current_period_start,
        periodEnd: subscription.current_period_end
      }
    : null
  const fmt = (n: number): string =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  /**
   * Buy `qty` numbers. A refusal (already subscribed) is shown as-is; any other
   * failure falls back to the dashboard rather than stranding the user on a
   * dead button.
   */
  const buy = async (qty: number): Promise<void> => {
    if (busy != null) return
    setBusy(qty)
    try {
      window.open(await startPhoneCheckout(qty, term), '_blank', 'noopener,noreferrer')
    } catch (e) {
      if (e instanceof PhoneCheckoutRefused) onError?.(e.message)
      else window.open(PHONE_DASHBOARD_URL, '_blank', 'noopener,noreferrer')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={compact ? 'phone-pricing compact' : 'phone-pricing'}>
      {!compact && (
        <div className="buy-typebar">
          <span className="buy-flag">
            <Flag code="US" size={30} title="United States" />
          </span>
          <div>
            <div className="buy-typebar-n">Real US non-VoIP numbers</div>
            <div className="buy-typebar-d">
              Yours while subscribed · SMS codes arrive instantly · works with YouTube &amp; Gmail
            </div>
          </div>
          <PoweredByTubeProxies />
        </div>
      )}

      <div className="buy-toggle-row">
        {/* Monthly → Quarterly → Annual, matching the order and discounts on
            tubeghost.com and the TubeProxies dashboard. Annual was missing
            here even though every phone tier has an annual price. */}
        <div className="buy-toggle">
          {PHONE_TERMS.map(([id, label, off]) => (
            <button
              key={id}
              className={'bt-opt' + (term === id ? ' on' : '')}
              onClick={() => setTerm(id)}
            >
              {label}
              {off && <span className="bt-off">{off}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="tpp-grid cols-4">
        {PHONE_TIERS.map((t) => {
          const monthly = t.monthlyPrice * mult
          // What Stripe actually charges per period: 3x on quarterly, 12x on
          // annual, matching the dashboard's "Billed ... at" line.
          const billed = monthly * (term === 'annual' ? 12 : term === 'quarterly' ? 3 : 1)
          // Versus buying the same count as single numbers at the 1-pack rate.
          const single = PHONE_TIERS[0].monthlyPrice * mult
          const saving = single * t.quantity - monthly
          return (
            <div key={t.quantity} className={'tpp-card' + (t.popular ? ' feat' : '')}>
              {t.popular && <div className="tpp-best">Most popular</div>}
              <div className="tpp-name">
                {t.quantity} number{t.quantity > 1 ? 's' : ''}
                {t.discountPercent > 0 && (
                  <span className="tpp-pct">Save {t.discountPercent}%</span>
                )}
              </div>
              <div className="tpp-desc">
                {t.quantity === 1
                  ? 'For a single channel'
                  : `For ${t.quantity} channels or accounts`}
              </div>
              {/* Headline is the PACK's monthly cost, matching
                  dash.tubeproxies.com. It used to show the per-number rate,
                  which reads cheaper than the card actually costs. */}
              <div className="tpp-price">
                ${fmt(monthly)}
                <span className="per">/mo</span>
              </div>
              {/* The "Billed …" and "Save …" lines are absent on some tiers
                  (1-number never saves vs. itself). Reserving the space keeps
                  every card's CTA on the same baseline instead of letting the
                  buttons stagger across the row. */}
              <div className="tpp-meta">
                {term !== 'monthly' && (
                  <div className="tpp-sub">
                    Billed {term === 'annual' ? 'annually' : 'quarterly'} at ${fmt(billed)}
                  </div>
                )}
                {saving > 0 && (
                  <div className="tpp-save">Save ${fmt(saving)}/mo vs. buying separately</div>
                )}
              </div>
              {(() => {
                const action = phoneTileAction(current, t.quantity, term)
                // No subscription -> plain purchase, unchanged.
                if (!current) {
                  return (
                    <button
                      className={'tpp-buy' + (t.popular ? ' red' : '')}
                      disabled={busy != null}
                      onClick={() => void buy(t.quantity)}
                    >
                      {busy === t.quantity
                        ? 'Starting…'
                        : `Get ${t.quantity === 1 ? 'number' : 'numbers'}`}
                    </button>
                  )
                }
                if (action.kind === 'current') {
                  return <div className="tpp-buy tpp-current">Current plan</div>
                }
                if (action.disabled) {
                  return (
                    <button className="tpp-buy" disabled>
                      {action.label}
                    </button>
                  )
                }
                return (
                  <button
                    className={'tpp-buy' + (t.popular ? ' red' : '')}
                    disabled={busy != null}
                    onClick={() =>
                      onChangePlan
                        ? onChangePlan(t.quantity, term)
                        : window.open(PHONE_DASHBOARD_URL, '_blank', 'noopener,noreferrer')
                    }
                  >
                    {action.label}
                  </button>
                )
              })()}
              <div className="tpp-cancel">Cancel anytime</div>
              <div className="tpp-feats">
                <div className="tpp-feat yes">
                  <Check size={14} />
                  Instant SMS delivery
                </div>
                <div className="tpp-feat yes">
                  <Check size={14} />
                  Team sharing included
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!compact && (
        <div className="buy-foot">
          <div className="buy-foot-feat">
            <Check size={14} />
            Real US non-VoIP — accepted by Google
          </div>
          <div className="buy-foot-feat">
            <Check size={14} />
            Codes appear in your inbox instantly
          </div>
          <div className="buy-foot-feat">
            <Check size={14} />
            Assign numbers to any profile
          </div>
          <div className="buy-foot-help">
            Need more than 15 numbers?{' '}
            <span className="bs-link" onClick={openPhonePurchase}>
              Talk to TubeProxies
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
