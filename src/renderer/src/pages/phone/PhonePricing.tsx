import * as React from 'react'
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { PoweredByTubeProxies } from '@/components/PoweredByTubeProxies'
import { Flag } from '@/components/Flag'
import { openPhoneCheckout } from '@/lib/tubeproxies-checkout'
import {
  PHONE_QUARTERLY_MULT,
  PHONE_TEAM_SHARING_MIN,
  PHONE_TIERS
} from '@shared/phone-plans'

/**
 * The phone-number price ladder.
 *
 * Shown full-page when the user has no numbers (so the first thing they see
 * is the price, not an empty table), and as a "buy more" section once they
 * do. TubeProxies bills and provisions these — every CTA hands off to its
 * checkout.
 */
export function PhonePricing({
  compact = false
}: {
  /** Tighter heading + no footer, for embedding under an existing table. */
  compact?: boolean
}): React.ReactElement {
  const [term, setTerm] = useState<'quarterly' | 'monthly'>('quarterly')
  const mult = term === 'quarterly' ? PHONE_QUARTERLY_MULT : 1
  const fmt = (n: number): string =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
        <div className="buy-toggle">
          <button
            className={'bt-opt' + (term === 'quarterly' ? ' on' : '')}
            onClick={() => setTerm('quarterly')}
          >
            Quarterly <span className="bt-off">10% Off</span>
          </button>
          <button
            className={'bt-opt' + (term === 'monthly' ? ' on' : '')}
            onClick={() => setTerm('monthly')}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="tpp-grid cols-4">
        {PHONE_TIERS.map((t) => {
          const perNumber = t.pricePerNumber * mult
          const monthly = t.monthlyPrice * mult
          return (
            <div key={t.quantity} className={'tpp-card' + (t.popular ? ' feat' : '')}>
              {t.popular && <div className="tpp-best">Most popular</div>}
              <div className="tpp-name">
                {t.quantity} number{t.quantity > 1 ? 's' : ''}
              </div>
              <div className="tpp-desc">
                {t.quantity === 1
                  ? 'For a single channel'
                  : `For ${t.quantity} channels or accounts`}
              </div>
              <div className="tpp-price">
                ${fmt(perNumber)}
                <span className="per">/ea</span>
              </div>
              <div className="tpp-sub">
                ${fmt(monthly)}/month · {term === 'quarterly' ? 'Quarterly' : 'Monthly'}
              </div>
              <button
                className={'tpp-buy' + (t.popular ? ' red' : '')}
                onClick={openPhoneCheckout}
              >
                Get {t.quantity === 1 ? 'number' : 'numbers'}
              </button>
              <div className="tpp-cancel">Cancel anytime</div>
              <div className="tpp-feats">
                <div className="tpp-feat yes">
                  <Check size={14} />
                  Instant SMS delivery
                </div>
                <div
                  className={
                    'tpp-feat' + (t.quantity >= PHONE_TEAM_SHARING_MIN ? ' yes' : ' no')
                  }
                >
                  {t.quantity >= PHONE_TEAM_SHARING_MIN ? <Check size={14} /> : <X size={14} />}
                  {t.quantity >= PHONE_TEAM_SHARING_MIN
                    ? 'Team sharing included'
                    : `Team sharing at ${PHONE_TEAM_SHARING_MIN}+`}
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
            <span className="bs-link" onClick={openPhoneCheckout}>
              Talk to TubeProxies
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
