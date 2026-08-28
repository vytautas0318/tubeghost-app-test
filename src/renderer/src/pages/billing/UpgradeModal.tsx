// Upgrade configurator — the same graduated plan/cycle math as the marketing
// pricing page, driven by the shared pricing module, but pre-seeded from live
// workspace usage and wired to the billing-checkout Edge Function.
//
// The plan cards live in UpgradeCards.tsx; this file is the modal shell,
// accessibility behaviour, and the submit/guard logic.

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import type { PlanCycle } from '@shared/pricing'
import { useUpgradeConfig, type Quote } from './useUpgradeConfig'
import { StarterCard, TeamCard, EnterpriseCard, AddonNote } from './UpgradeCards'
import { billingApi, type UpgradePayload } from './billingApi'
import type { BillingPlan, BillingUsage } from './types'
import { formatDate, type CurrentSubscription } from './currentPlan'

// All three cycles, matching the marketing pricing table.
// Wording matches the Proxies and Phone ladders exactly — "Save 10%", not
// "−10%" — so the same discount never reads two ways across the app.
const CYCLES: [PlanCycle, string, string][] = [
  ['monthly', 'Monthly', ''],
  ['quarterly', 'Quarterly', 'Save 10%'],
  ['annual', 'Annual', 'Save 20%']
]

export function UpgradeModal({
  usage,
  plan,
  workspaceId,
  currentProfileCount,
  onManageBilling,
  onClose
}: {
  usage: BillingUsage
  /** Active subscription, or null while loading / on free. */
  plan: BillingPlan | null
  workspaceId: string | null
  /** null when the live count failed — the local guard is then skipped. */
  currentProfileCount: number | null
  /** Opens Stripe's billing portal — where an existing subscription changes. */
  onManageBilling: () => void
  onClose: () => void
}): React.ReactElement {
  const cfg = useUpgradeConfig(usage)
  // What the workspace already pays for, in the shape the cards compare
  // against. A lapsed subscription is not "current" — those customers need to
  // be able to re-subscribe to the same plan.
  const current: CurrentSubscription | null =
    plan && plan.status !== 'canceled'
      ? {
          planId: plan.id,
          profiles: plan.profileLimit,
          seats: plan.seats,
          cycle: plan.cycle
        }
      : null
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  // Focus trap + Esc to close + focus restore on unmount.
  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null
    const node = ref.current
    node?.querySelector<HTMLElement>('button, input')?.focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href]'
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      restoreTo.current?.focus?.()
    }
  }, [onClose])

  /**
   * Downgrade guard: block a plan the workspace does not fit, on either
   * profiles or seats, naming exactly what has to change.
   *
   * UX only — billing-checkout enforces the same rules server-side. When a
   * count is unknown (null) we let the request through rather than block on a
   * guess; the server refuses with an accurate message if it truly doesn't fit.
   *
   * Team's steppers floor at the workspace's own usage so they can't produce a
   * blocked configuration, but Starter is fixed at 10 profiles / 1 seat — so
   * without this a 4-member workspace clicks "Choose Starter" and gets a bare
   * 409 from the server with no way to act on it.
   */
  const blockedBy = (targetProfiles: number, targetSeats: number): string | null => {
    if (currentProfileCount != null && currentProfileCount > targetProfiles) {
      return `You're using ${currentProfileCount} profiles. Delete ${
        currentProfileCount - targetProfiles
      } to fit this plan's limit of ${targetProfiles}.`
    }
    const seatsUsed = usage.seatsUsed
    if (seatsUsed != null && seatsUsed > targetSeats) {
      return targetSeats === 1
        ? `This is a single-operator plan and your workspace has ${seatsUsed} members. ` +
            `Remove ${seatsUsed - 1}, or choose Team instead.`
        : `Your workspace has ${seatsUsed} members but this configuration seats ${targetSeats}.`
    }
    return null
  }

  /**
   * A workspace that already pays for a plan cannot buy another — Stripe would
   * create a SECOND subscription and bill for both. Changing an existing one is
   * what the billing portal is for: it handles proration, upgrades, downgrades
   * and cancellation, which a fresh Checkout session cannot.
   *
   * Free (and lapsed) workspaces still go through checkout, since there is no
   * subscription to amend.
   */
  const hasActivePlan = current != null && current.planId !== 'free'

  const submit = async (
    planId: string,
    profiles: number,
    members: number,
    q: Quote
  ): Promise<void> => {
    if (hasActivePlan) {
      onManageBilling()
      onClose()
      return
    }
    const blocked = blockedBy(profiles, members)
    if (blocked) {
      setError(blocked)
      return
    }
    setError(null)
    setBusy(planId)
    const payload: UpgradePayload = {
      workspaceId: workspaceId ?? '',
      planId,
      cycle: cfg.cycle,
      members,
      profiles,
      // Display-only; the server recomputes and refuses on mismatch.
      quotedCharged: q.charged
    }
    try {
      await billingApi.startUpgrade(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bill-up-backdrop" onClick={onClose}>
      <div
        className="bill-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-up-title"
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bill-up-head">
          <div>
            <h2 id="bill-up-title">Change plan</h2>
            {/* When a plan is set to cancel, say when access ends — otherwise
                "Change plan" gives no hint that the current one is expiring. */}
            <p>Configured from your current workspace usage.</p>
          </div>
          <button className="bill-up-x" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        {/* A scheduled cancellation is easy to forget, and "Change plan" gives
            no hint the current one is ending — so say the date outright. */}
        {plan?.cancelAtPeriodEnd && plan.currentPeriodEnd && (
          <div className="bill-up-notice">
            <AlertTriangle size={15} />
            <span>
              Your {plan.name} plan ends on {formatDate(plan.currentPeriodEnd)} — you keep access
              until then.
            </span>
          </div>
        )}

        {/* Same control as the Proxies and Phone ladders (buy-toggle), so the
            three pricing surfaces read as one system. */}
        <div className="buy-toggle-row">
          <div className="buy-toggle" role="group" aria-label="Billing cycle">
            {CYCLES.map(([id, label, save]) => (
              <button
                key={id}
                className={'bt-opt' + (cfg.cycle === id ? ' on' : '')}
                aria-pressed={cfg.cycle === id}
                onClick={() => cfg.setCycle(id)}
              >
                {label}
                {save && <span className="bt-off">{save}</span>}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bill-up-err" role="alert">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        <div className="bill-up-grid">
          <StarterCard
            cfg={cfg}
            busy={busy}
            current={current}
            hasActivePlan={hasActivePlan}
            onChoose={() =>
              void submit('starter', cfg.starter.profiles, cfg.starter.members, cfg.starter.quote)
            }
          />
          <TeamCard
            cfg={cfg}
            busy={busy}
            current={current}
            hasActivePlan={hasActivePlan}
            onChoose={() =>
              void submit('team', cfg.team.profiles, cfg.team.members, cfg.team.quote)
            }
          />
          <EnterpriseCard />
        </div>

        <AddonNote />
      </div>
    </div>
  )
}
