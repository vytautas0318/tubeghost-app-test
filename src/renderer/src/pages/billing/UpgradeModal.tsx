import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  ADDONS_IN_CHECKOUT_ENABLED,
  money,
  PLANS,
  type Cycle,
  type GhostPlanKey
} from '@shared/pricing'
import { startSingleCheckout } from '@/lib/billing-api'
import { CountStepper, ProfileStepper } from './Steppers'
import { BundlePicker } from './BundlePicker'
import { PHONE_BUNDLES, purchasableProxyBundles } from '@shared/addons'
import { useOwnedProxies } from './useOwnedProxies'
import { useOrderValidation } from './useOrderValidation'
import { SEAT_RATE, useUpgradeConfig, type UpgradeUsage } from './useUpgradeConfig'

const CYCLES: [Cycle, string, string | null][] = [
  ['monthly', 'Monthly', null],
  ['quarterly', 'Quarterly', '−10%'],
  ['annual', 'Annual', '2 months free']
]

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
  currentPlan,
  onManageBilling,
  onClose
}: {
  usage: UpgradeUsage
  workspaceId: string | null
  /** ghost.workspaces.plan — 'free' | 'starter' | 'team'. */
  currentPlan?: string | null
  /** Opens Stripe's portal, where an existing plan is changed. */
  onManageBilling?: () => void
  onClose: () => void
}): React.ReactElement {
  const cfg = useUpgradeConfig(usage)
  const { active: ownedProxies } = useOwnedProxies(workspaceId)

  // Checked before payment so predictable failures — out-of-stock proxies, a
  // bundle that would assign nothing — surface while the selection can still
  // be changed, rather than after the card is charged.
  const validation = useOrderValidation({
    workspaceId,
    plan: 'team',
    cycle: cfg.cycle,
    profiles: cfg.team.profiles,
    seats: cfg.team.seats,
    proxies: cfg.addOns.proxies,
    numbers: cfg.addOns.numbers
  })
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
      // ONE checkout page. Stripe saves the card without charging; the
      // webhook then creates a subscription per product (three tables each
      // need their own subscription id, so one session cannot cover them).
      await startSingleCheckout({
        workspaceId,
        plan,
        cycle: cfg.cycle,
        // Ignored for Starter, which has fixed allowances.
        profiles: cfg.team.profiles,
        seats: cfg.team.seats,
        // The add-on selectors live on the Team card only, so a Starter
        // purchase must not silently carry whatever was configured there.
        proxies: plan === 'team' ? cfg.addOns.proxies : 0,
        numbers: plan === 'team' ? cfg.addOns.numbers : 0
      })
      // startSingleCheckout navigates to Stripe on success; reaching here
      // means it resolved without redirecting, so release the button.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.')
    } finally {
      setBusy(null)
    }
  }

  /**
   * The CTA for a plan card.
   *
   * A subscriber's CURRENT plan can't be re-bought — checkout rejects a
   * second subscription (409 subscription_exists), so offering "Choose" would
   * dead-end. Changing an existing plan goes through Stripe's portal, which
   * handles proration; we never build a second subscription alongside the
   * first.
   */
  const planCta = (plan: GhostPlanKey, label: string): React.ReactElement => {
    if (currentPlan === plan) {
      return (
        <Button
          style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}
          disabled
        >
          Current plan
        </Button>
      )
    }
    const subscribed = currentPlan != null && currentPlan !== 'free'
    // Only Team carries add-ons, so only Team is gated on their validation.
    const blocked = plan === 'team' && validation.blocked
    return (
      <Button
        variant="primary"
        style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}
        disabled={busy !== null || blocked}
        title={blocked ? 'Resolve the issues above to continue' : undefined}
        onClick={() => (subscribed ? onManageBilling?.() : void start(plan))}
      >
        {busy === plan ? 'Starting…' : subscribed ? 'Switch plan' : label}
      </Button>
    )
  }

  const priceBlock = (
    q: { listMonthly: number; monthly: number; billed: number },
    addOnList: number
  ): React.ReactElement => (
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
      {/* Make it explicit that the headline figure already includes the
          add-ons, so the Stripe total is never a surprise. */}
      {addOnList > 0 && <p className="bill-up-incl">includes add-ons</p>}

      {/* The commitment, stated where the decision is made.
          Stripe's page is in SETUP mode: its button says "Save", not "Pay",
          and the amount appears only as small grey text that is easy to
          miss. This is the last clear chance to show what will be charged,
          so it must be unmissable here. */}
      <p className="bill-up-charge">
        You&apos;ll be charged <strong>{money(q.billed || q.monthly)}</strong>
        {cfg.cycle === 'annual'
          ? ' today, then yearly'
          : cfg.cycle === 'quarterly'
            ? ' today, then every 3 months'
            : ' today, then monthly'}
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

        {/* Add-ons apply to whichever plan is chosen below, so they sit
            outside the plan cards. Hidden on annual — TubeProxies sells no
            annual price and one Checkout session can't mix intervals. */}
        {cfg.addOns.available ? (
          <div className="bill-up-addons">
            <div className="bill-up-addons-h">
              Add proxies &amp; numbers
              <em>From TubeProxies · billed together with your plan</em>
            </div>
            <div className="bill-up-row">
              <span>
                Proxies
                <em>
                  {ownedProxies > 0
                    ? `US static residential · you have ${ownedProxies}`
                    : 'US static residential'}
                </em>
              </span>
              {/* Bundles at or below what they already hold are omitted:
                  TubeProxies assigns greatest(0, limit − owned), so those
                  charge the customer and assign nothing. */}
              <BundlePicker
                value={cfg.addOns.proxies}
                onChange={cfg.addOns.setProxies}
                options={purchasableProxyBundles(ownedProxies).map((b) => ({
                  value: b.proxies,
                  label: `${b.proxies} IP${b.proxies > 1 ? 's' : ''} — ${money(b.monthly)}/mo`
                }))}
                label="Proxies"
              />
            </div>
            {validation.issues
              .filter((i) => i.item === 'proxies')
              .map((i) => (
                <div key={i.message} className={'bill-up-issue' + (i.blocking ? ' blocking' : '')}>
                  {i.message}
                </div>
              ))}

            <div className="bill-up-row">
              <span>
                Phone numbers<em>US non-VoIP, for 2FA</em>
              </span>
              <BundlePicker
                value={cfg.addOns.numbers}
                onChange={cfg.addOns.setNumbers}
                options={PHONE_BUNDLES.map((b) => ({
                  value: b.numbers,
                  label: `${b.numbers} number${b.numbers > 1 ? 's' : ''} — ${money(b.monthly)}/mo`
                }))}
                label="Phone numbers"
              />
            </div>

            {validation.issues
              .filter((i) => i.item === 'numbers')
              .map((i) => (
                <div key={i.message} className={'bill-up-issue' + (i.blocking ? ' blocking' : '')}>
                  {i.message}
                </div>
              ))}
          </div>
        ) : ADDONS_IN_CHECKOUT_ENABLED ? (
          // Switch is on, so this is the annual-cycle exclusion.
          <div className="bill-up-addons muted">
            Proxies and phone numbers aren&apos;t available on annual billing — choose monthly or
            quarterly to add them, or buy them separately any time.
          </div>
        ) : null}

        <div className="bill-up-grid">
          {/* STARTER — fixed allowances, nothing to configure. */}
          <div className={'bill-up-card' + (currentPlan === 'starter' ? ' current' : '')}>
            <h3>
              Starter
              {currentPlan === 'starter' && <span className="bill-up-now">Current</span>}
            </h3>
            <p className="bill-up-tag">To get going. One operator, ten clean channels.</p>
            <div className="bill-up-row">
              <span>
                Profiles<em>1 seat · solo</em>
              </span>
              <span className="bill-up-fixed">10</span>
            </div>
            {priceBlock(cfg.total('starter'), cfg.addOns.list)}
            {planCta('starter', 'Choose Starter')}
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
          <div
            className={'bill-up-card featured' + (currentPlan === 'team' ? ' current' : '')}
          >
            {currentPlan !== 'team' && <span className="pg-sticker">★ CROWD FAVOURITE</span>}
            <h3>
              Team
              {currentPlan === 'team' && <span className="bill-up-now">Current</span>}
            </h3>
            <p className="bill-up-tag">For growing creators &amp; teams. Profiles that scale.</p>
            <div className="bill-up-row">
              <span>
                Profiles
                <em>
                  {cfg.team.atMax
                    ? 'Need more? Talk to sales'
                    : `${money(cfg.team.perProfile)}/profile · scales with volume`}
                </em>
              </span>
              <ProfileStepper value={cfg.team.profiles} onChange={cfg.team.setProfiles} />
            </div>
            <div className="bill-up-row">
              <span>
                Team members
                <em>
                  {PLANS.team.seatsIncluded} included · {money(SEAT_RATE)}/ea after
                </em>
              </span>
              <CountStepper
                value={cfg.team.seats}
                onChange={cfg.team.setSeats}
                label="Team members"
                min={PLANS.team.seatsIncluded}
              />
            </div>
            {priceBlock(cfg.total('team'), cfg.addOns.list)}
            {planCta('team', 'Choose Team')}
            <ul className="bill-up-feats">
              {TEAM_FEATURES.map((f) => (
                <li key={f}>
                  <Check size={14} />
                  {f}
                </li>
              ))}
            </ul>
          </div>

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
          The next page saves your card — you&apos;ll see the amount there before confirming.
          Profiles and team seats are billed by TubeGhost; proxies and phone numbers come from
          TubeProxies and appear as separate charges.
        </p>
      </div>
    </div>
  )
}
