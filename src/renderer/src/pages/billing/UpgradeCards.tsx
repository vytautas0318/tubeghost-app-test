// The three plan cards inside the upgrade modal. Split out of UpgradeModal.tsx
// to stay under the 250-line file limit. All prices come from the shared
// pricing module via useUpgradeConfig — no math lives here.

import * as React from 'react'
import { Button } from '@tubeghost/ui'
import { PlanGhosts } from './PlanGhosts'
import { SEAT_RATE, money, type PlanCycle } from '@shared/pricing'
import { CountStepper, ProfileStepper } from './Steppers'
import type { PlanConfig, Quote, UpgradeConfig } from './useUpgradeConfig'
import { isCurrentPlan, ctaLabel, type CurrentSubscription } from './currentPlan'

/** Price block: struck list price (hidden on monthly), big monthly, billed note. */
export function PriceBlock({ q, cycle }: { q: Quote; cycle: PlanCycle }): React.ReactElement {
  return (
    <div className="bill-up-price">
      {cycle !== 'monthly' && <s>{money(q.listMonthly)}/mo</s>}
      <strong>
        {money(q.monthly)}
        <i>/mo</i>
      </strong>
      <p>
        {cycle === 'annual'
          ? `${money(q.charged)} billed yearly · save 20%`
          : cycle === 'quarterly'
            ? `${money(q.charged)} billed quarterly · save 10%`
            : 'billed monthly'}
      </p>
    </div>
  )
}

function Row({
  label,
  hint,
  inset,
  children
}: {
  label: string
  hint?: string
  /** Renders the row as the site's inset dashed panel (used for Profiles). */
  inset?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className={'bill-up-row' + (inset ? ' inset' : '')}>
      <span>
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {children}
    </div>
  )
}

/** Feature checklist under each CTA — same copy as the marketing page. */
function Checks({ items }: { items: string[] }): React.ReactElement {
  return (
    <ul className="pg-checks">
      {items.map((f) => (
        <li key={f}>{f}</li>
      ))}
    </ul>
  )
}

export function StarterCard({
  cfg,
  busy,
  current,
  hasActivePlan = false,
  onChoose
}: {
  cfg: UpgradeConfig
  busy: string | null
  current: CurrentSubscription | null
  /** Workspace already pays for a plan — the CTA opens the billing portal. */
  hasActivePlan?: boolean
  onChoose: () => void
}): React.ReactElement {
  const p: PlanConfig = cfg.starter
  const isCurrent = isCurrentPlan(current, {
    planKey: 'starter',
    profiles: p.plan.profiles,
    seats: p.plan.seatsIncluded,
    cycle: cfg.cycle,
    configurable: false
  })
  return (
    <div className="bill-up-card">
      <PlanGhosts color="#5fe0a0" />
      <h3>Starter</h3>
      <p className="bill-up-tag">To get going. One operator, ten clean channels.</p>
      <Row label="Profiles" hint="1 seat · solo" inset>
        <strong className="bill-up-fixed">{p.plan.profiles}</strong>
      </Row>
      <PriceBlock q={p.quote} cycle={cfg.cycle} />
      <Checks
        items={[
          `${p.plan.profiles} anti-detect profiles`,
          'Built-in 2FA authenticator (replaces Google Authenticator)',
          'Add proxies & numbers'
        ]}
      />
      <Button
        className="bill-up-cta"
        disabled={busy != null || isCurrent}
        aria-current={isCurrent ? 'true' : undefined}
        title={
          isCurrent
            ? 'This is the plan you are on'
            : hasActivePlan
              ? 'Opens Stripe to change your existing subscription'
              : undefined
        }
        onClick={onChoose}
      >
        {ctaLabel(isCurrent, busy === 'starter', 'Starter', hasActivePlan)}
      </Button>
    </div>
  )
}

export function TeamCard({
  cfg,
  busy,
  current,
  hasActivePlan = false,
  onChoose
}: {
  cfg: UpgradeConfig
  busy: string | null
  current: CurrentSubscription | null
  /** Workspace already pays for a plan — the CTA opens the billing portal. */
  hasActivePlan?: boolean
  onChoose: () => void
}): React.ReactElement {
  const t: PlanConfig = cfg.team
  // Team is configurable: only the exact configuration already being paid for
  // counts as current. Moving either stepper re-enables the button, because
  // that IS a real upgrade or downgrade.
  const isCurrent = isCurrentPlan(current, {
    planKey: 'team',
    profiles: t.profiles,
    seats: t.members,
    cycle: cfg.cycle,
    configurable: true
  })
  return (
    <div className="bill-up-card featured">
      <span className="pg-sticker">★ CROWD FAVOURITE</span>
      <PlanGhosts color="var(--red)" count={3} />
      <h3>Team</h3>
      <p className="bill-up-tag">For growing creators &amp; teams. Profiles that scale.</p>
      {/* Profile capacity is what you configure — the price walks the
          graduated bands, so the per-profile rate falls as volume rises. */}
      <Row
        label="Profiles"
        inset
        hint={
          t.atMaxProfiles
            ? 'Need more? Talk to sales'
            : `${money(t.quote.perProfile)}/profile · scales with volume`
        }
      >
        <ProfileStepper value={t.profiles} onChange={t.setProfiles} min={t.minProfiles} />
      </Row>
      <Row
        label="Team members"
        hint={
          t.extraSeats > 0
            ? `${t.plan.seatsIncluded} included · ${t.extraSeats} extra at ${money(SEAT_RATE)}/ea`
            : `${t.plan.seatsIncluded} included · ${money(SEAT_RATE)}/ea after`
        }
      >
        {/* Floors at the workspace's own member count when that exceeds the
            included seats — you cannot buy fewer seats than you occupy. */}
        <CountStepper
          value={t.members}
          onChange={t.setMembers}
          label="Team members"
          min={t.minMembers}
        />
      </Row>
      <PriceBlock q={t.quote} cycle={cfg.cycle} />
      <Checks
        items={[
          'Profiles that scale with you',
          `${t.plan.seatsIncluded} team members included, add more anytime`,
          'Roles & access control',
          'Shared proxies, numbers & authenticators',
          'Automation, synchroniser & API'
        ]}
      />
      <Button
        variant="primary"
        className="bill-up-cta"
        disabled={busy != null || isCurrent}
        aria-current={isCurrent ? 'true' : undefined}
        title={
          isCurrent
            ? 'This is the plan you are on'
            : hasActivePlan
              ? 'Opens Stripe to change your existing subscription'
              : undefined
        }
        onClick={onChoose}
      >
        {ctaLabel(isCurrent, busy === 'team', 'Team', hasActivePlan)}
      </Button>
    </div>
  )
}

export function EnterpriseCard(): React.ReactElement {
  return (
    <div className="bill-up-card">
      <PlanGhosts color="#a78bfa" count={5} />
      <h3>Enterprise</h3>
      <p className="bill-up-tag">For agencies &amp; networks running fleets.</p>
      <Row label="Profiles" hint="Custom seats & volume pricing" inset>
        <strong className="bill-up-fixed">1,000+</strong>
      </Row>
      <div className="bill-up-price">
        <strong>Let&apos;s talk</strong>
        <p>Tailored to your volume.</p>
      </div>
      <Checks items={['Unlimited profiles', 'SSO & audit log', 'Dedicated manager']} />
      <Button
        className="bill-up-cta"
        onClick={() => window.open('https://tubeghost.com/#contact', '_blank')}
      >
        Talk to sales
      </Button>
    </div>
  )
}

/** Footnote mirroring the marketing page: add-ons are billed per unit. */
export function AddonNote(): React.ReactElement {
  return (
    <p className="bill-up-note" role="note">
      Proxies and phone numbers are billed per unit and shared with TubeProxies.
    </p>
  )
}
