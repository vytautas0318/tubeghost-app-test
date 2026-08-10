import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui'
<<<<<<< HEAD
import { money, PLANS, type Cycle, type GhostPlanKey } from '@shared/pricing'
=======
import { money, PF_MAX, type Cycle, type GhostPlanKey } from '@shared/pricing'
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
import { startCheckout } from '@/lib/billing-api'
import { CountStepper, ProfileStepper } from './Steppers'
import { SEAT_RATE, useUpgradeConfig, type UpgradeUsage } from './useUpgradeConfig'

const CYCLES: [Cycle, string, string | null][] = [
  ['monthly', 'Monthly', null],
  ['quarterly', 'Quarterly', '−10%'],
  ['annual', 'Annual', '2 months free']
]

<<<<<<< HEAD
// Copy mirrors TubeGhostMarketing/app/components/PricingTable.tsx so the app
// and the site describe the same plans. Update both together.
const STARTER_FEATURES = [
  '10 anti-detect profiles',
  'Built-in 2FA authenticator (replaces Google Authenticator)',
  'Add proxies & numbers'
]
const TEAM_FEATURES = [
  'Profiles that scale with you',
  `${PLANS.team.seatsIncluded} team members included, add more anytime`,
  'Roles & access control',
  'Shared proxies, numbers & authenticators',
  'Automation & API'
]
const ENTERPRISE_FEATURES = ['Unlimited profiles', 'SSO & audit log', 'Dedicated manager']

/** Where "Talk to sales" goes. Enterprise is quoted manually, not self-serve. */
const SALES_URL = 'https://tubeghost.com/#pricing'
=======
const STARTER_FEATURES = [
  '10 anti-detect profiles',
  'Built-in 2FA authenticator',
  'Add proxies & numbers separately'
]
const TEAM_FEATURES = [
  'Profiles that scale with you',
  'Team members, roles & access',
  'Shared proxies, numbers & authenticators',
  'Automation & API'
]
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f

/**
 * Plan chooser + checkout hand-off.
 *
 * Quotes come from the shared pricing module so they match the marketing
 * site exactly, but they are DISPLAY ONLY — the checkout endpoint recomputes
 * from the same module and Stripe charges from its own price objects. A
 * number shown here never determines what someone pays.
 */
export function UpgradeModal({
  usage,
  workspaceId,
  onClose
}: {
  usage: UpgradeUsage
  workspaceId: string | null
  onClose: () => void
}): React.ReactElement {
  const cfg = useUpgradeConfig(usage)
  const [busy, setBusy] = useState<GhostPlanKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Escape closes, matching every other modal in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const start = async (plan: GhostPlanKey): Promise<void> => {
    if (!workspaceId) {
      setError('No workspace selected.')
      return
    }
    setError(null)
    setBusy(plan)
    try {
      await startCheckout({
        workspaceId,
        plan,
        cycle: cfg.cycle,
        // Ignored for Starter, which has fixed allowances.
        profiles: cfg.team.profiles,
        seats: cfg.team.seats
      })
      // startCheckout navigates to Stripe on success; reaching here means it
      // resolved without redirecting, so release the button.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.')
    } finally {
      setBusy(null)
    }
  }

  const priceBlock = (q: { listMonthly: number; monthly: number; billed: number }): React.ReactElement => (
    <div className="bill-up-price">
      {cfg.cycle !== 'monthly' && <s>{money(q.listMonthly)}/mo</s>}
      <strong>
        {money(q.monthly)}
        <i>/mo</i>
      </strong>
      <p>
        {cfg.cycle === 'annual'
          ? `${money(q.billed)} billed yearly`
          : cfg.cycle === 'quarterly'
            ? `${money(q.billed)} billed quarterly`
            : 'billed monthly'}
      </p>
    </div>
  )

  return (
    <div className="bill-up-backdrop" onClick={onClose}>
      <div
        className="bill-up"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a plan"
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bill-up-head">
          <div>
            <h2>Choose a plan</h2>
            <p>Proxies and phone numbers are billed separately by TubeProxies.</p>
          </div>
          <button className="bill-up-x" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="bill-up-cycles">
          {CYCLES.map(([c, label, save]) => (
            <button
              key={c}
              className={cfg.cycle === c ? 'on' : ''}
              onClick={() => cfg.setCycle(c)}
            >
              {label}
              {save && <span>{save}</span>}
            </button>
          ))}
        </div>

        {error && <div className="bill-up-err">{error}</div>}

        <div className="bill-up-grid">
          {/* STARTER — fixed allowances, nothing to configure. */}
          <div className="bill-up-card">
            <h3>Starter</h3>
<<<<<<< HEAD
            <p className="bill-up-tag">To get going. One operator, ten clean channels.</p>
            <div className="bill-up-row">
              <span>
                Profiles<em>1 seat · solo</em>
              </span>
              <span className="bill-up-fixed">10</span>
=======
            <p className="bill-up-tag">One operator, ten clean channels.</p>
            <div className="bill-up-fixed">
              <span>Profiles</span>
              <strong>10</strong>
            </div>
            <div className="bill-up-fixed">
              <span>Team seats</span>
              <strong>1</strong>
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
            </div>
            {priceBlock(cfg.starter.quote)}
            <Button
              variant="primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}
              disabled={busy !== null}
              onClick={() => void start('starter')}
            >
              {busy === 'starter' ? 'Starting…' : 'Choose Starter'}
            </Button>
            <ul className="bill-up-feats">
              {STARTER_FEATURES.map((f) => (
                <li key={f}>
                  <Check size={14} />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* TEAM — configurable profiles + seats. */}
          <div className="bill-up-card featured">
<<<<<<< HEAD
            <span className="pg-sticker">★ CROWD FAVOURITE</span>
            <h3>Team</h3>
            <p className="bill-up-tag">For growing creators &amp; teams. Profiles that scale.</p>
=======
            <h3>Team</h3>
            <p className="bill-up-tag">For growing creators &amp; teams.</p>
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
            <div className="bill-up-row">
              <span>
                Profiles
                <em>
                  {cfg.team.atMax
                    ? 'Need more? Talk to sales'
<<<<<<< HEAD
                    : `${money(cfg.team.perProfile)}/profile · scales with volume`}
=======
                    : `${money(cfg.team.perProfile)}/profile`}
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
                </em>
              </span>
              <ProfileStepper value={cfg.team.profiles} onChange={cfg.team.setProfiles} />
            </div>
            <div className="bill-up-row">
              <span>
<<<<<<< HEAD
                Team members
                <em>
                  {PLANS.team.seatsIncluded} included · {money(SEAT_RATE)}/ea after
                </em>
=======
                Extra team members
                <em>{money(SEAT_RATE)}/ea · owner included</em>
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
              </span>
              <CountStepper
                value={cfg.team.seats}
                onChange={cfg.team.setSeats}
                label="Team members"
<<<<<<< HEAD
                min={PLANS.team.seatsIncluded}
=======
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
              />
            </div>
            {priceBlock(cfg.team.quote)}
            <Button
              variant="primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}
              disabled={busy !== null}
              onClick={() => void start('team')}
            >
              {busy === 'team' ? 'Starting…' : 'Choose Team'}
            </Button>
            <ul className="bill-up-feats">
              {TEAM_FEATURES.map((f) => (
                <li key={f}>
                  <Check size={14} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
<<<<<<< HEAD

          {/* ENTERPRISE — above PF_MAX there is no self-serve price, so this
              card quotes nothing and hands off to sales. */}
          <div className="bill-up-card">
            <h3>Enterprise</h3>
            <p className="bill-up-tag">For agencies &amp; networks running fleets.</p>
            <div className="bill-up-row">
              <span>
                Profiles<em>Custom seats &amp; volume pricing</em>
              </span>
              <span className="bill-up-fixed">1,000+</span>
            </div>
            <div className="bill-up-price">
              <strong>Let&apos;s talk</strong>
              <p>Tailored to your volume.</p>
            </div>
            <Button
              style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}
              onClick={() => window.open(SALES_URL, '_blank', 'noopener,noreferrer')}
            >
              Talk to sales
            </Button>
            <ul className="bill-up-feats">
              {ENTERPRISE_FEATURES.map((f) => (
                <li key={f}>
                  <Check size={14} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="bill-up-foot">
          Profiles and team seats are billed by TubeGhost. Proxies and phone numbers are bought
          separately from TubeProxies and billed on their own subscription.
=======
        </div>

        <p className="bill-up-foot">
          Above {PF_MAX.toLocaleString()} profiles, contact sales for Enterprise pricing.
>>>>>>> 72d9daa29100b218f45148bf6f574bf7a3a70b9f
        </p>
      </div>
    </div>
  )
}
