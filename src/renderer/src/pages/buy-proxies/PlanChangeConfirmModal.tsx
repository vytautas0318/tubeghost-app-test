// Confirm step for an in-app plan change.
//
// Modelled on tubeproxies-dash/src/components/PlanChangeConfirmModal.tsx —
// same flow, same numbers, and the same wording, rendered in the TubeGhost
// dark DS instead of the dashboard's light Tailwind theme. Copy is reused
// deliberately so the two products read identically ("Total due today",
// "Your existing N proxies stay the same…").
//
// No charge happens without passing through here: the preview is fetched
// first, and Confirm is the only path to the mutating call.

import * as React from 'react'
import { ArrowDown, ArrowUp, Loader2, X } from 'lucide-react'
import type { PlanChangePreview } from './planChange'

const fmtCurrency = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const periodLabel = (p: string): string =>
  p === 'annual' ? 'Annual' : p === 'quarterly' ? 'Quarterly' : 'Monthly'

const perUnit = (p: string): string =>
  p === 'annual' ? 'year' : p === 'quarterly' ? 'quarter' : 'month'

export function PlanChangeConfirmModal({
  planName,
  cycle,
  preview,
  loading,
  working,
  error,
  onCancel,
  onConfirm
}: {
  planName: string
  cycle: string
  /** Null while the preview is in flight. */
  preview: PlanChangePreview | null
  loading: boolean
  working: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}): React.ReactElement {
  const isDowngrade = preview?.kind === 'downgrade'
  const isIntervalOnly = preview?.isIntervalOnly ?? false
  const needsProxySelection = preview?.requiresProxySelection ?? false

  // Label the CTA by what the click actually does (dash: PlanChangeConfirmModal)
  //   - downgrade shedding proxies -> on to selection
  //   - cycle-only downgrade       -> scheduled straight away
  //   - upgrade with a charge      -> Stripe's hosted invoice authorises it,
  //                                   so "Confirm" would overstate this click
  //   - upgrade with $0 due        -> completes in place
  const confirmLabel = (() => {
    if (!preview) return 'Continue'
    if (isDowngrade) return needsProxySelection ? 'Continue' : 'Schedule change'
    return preview.chargedToday > 0 ? 'Continue to payment' : 'Confirm upgrade'
  })()

  // Name the direction even for an interval-only change: the card button says
  // "Downgrade to monthly", so a title reading "Switch ... billing" would look
  // like a different action. (The dash softens this to "Switch"; this app
  // states it plainly — see the note in BuyProxies.tsx.)
  const title =
    isIntervalOnly && preview
      ? `${isDowngrade ? 'Downgrade' : 'Upgrade'} ${planName} to ${periodLabel(cycle)} billing`
      : `${isDowngrade ? 'Downgrade' : 'Upgrade'} to ${planName}`

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/45 p-4"
      onClick={working ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-2 min-w-0">
            {isDowngrade ? (
              <ArrowDown className="w-4 h-4 text-[var(--amber, #f59e0b)] shrink-0" />
            ) : (
              <ArrowUp className="w-4 h-4 text-[var(--green)] shrink-0" />
            )}
            <h2 className="text-sm font-bold text-[var(--t1)] truncate">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={working}
            className="p-1 rounded text-[var(--t3)] hover:text-[var(--t1)] disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {preview?.test_mode && (
            <p className="text-[11px] text-[var(--t3)]">Test mode — no real money will move.</p>
          )}

          {/* What changes about the proxies themselves. */}
          {preview && !isIntervalOnly && (
            <p className="text-xs text-[var(--t2)]">
              {preview.proxyDifference < 0 ? (
                <>
                  You will lose {Math.abs(preview.proxyDifference)}{' '}
                  {Math.abs(preview.proxyDifference) === 1 ? 'proxy' : 'proxies'}.
                </>
              ) : preview.proxyDifference > 0 ? (
                <>
                  You will get {preview.proxyDifference} additional{' '}
                  {preview.proxyDifference === 1 ? 'proxy' : 'proxies'}. Your existing{' '}
                  {preview.currentPlan.proxies}{' '}
                  {preview.currentPlan.proxies === 1 ? 'proxy' : 'proxies'} stay the same.
                </>
              ) : null}
            </p>
          )}
          {preview && isIntervalOnly && (
            <p className="text-xs text-[var(--t2)]">
              Same {preview.newPlan.proxies} {preview.newPlan.proxies === 1 ? 'proxy' : 'proxies'} —
              only the billing period changes.
            </p>
          )}

          {/* Billing summary. */}
          <div className="border-t border-b border-[var(--line)] py-3 space-y-1.5 text-xs">
            {loading || !preview ? (
              <p className="text-[var(--t3)]">Calculating…</p>
            ) : isDowngrade ? (
              <>
                <Row label="Due today" value={fmtCurrency(0)} strong />
                {preview.effectiveDate && (
                  <Row label="Takes effect" value={fmtDate(preview.effectiveDate)} />
                )}
                <p className="pt-1 text-[11px] text-[var(--t3)]">
                  You keep your current plan until then — nothing is charged now.
                </p>
              </>
            ) : (
              <>
                {preview.tax > 0 && (
                  <>
                    <Row label="Subtotal" value={fmtCurrency(preview.subtotal)} />
                    <Row
                      label={`Tax${preview.taxPercent ? ` (${preview.taxPercent}% VAT)` : ''}`}
                      value={fmtCurrency(preview.tax)}
                    />
                  </>
                )}
                <Row label="Total due today" value={fmtCurrency(preview.chargedToday)} strong />
                {preview.nextBilling.date && (
                  <Row
                    label={`Then per ${perUnit(cycle)}`}
                    value={`renews ${fmtDate(preview.nextBilling.date)}`}
                  />
                )}
              </>
            )}
          </div>

          {error && <p className="text-xs text-[var(--red)]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            disabled={working}
            className="px-3 py-1.5 text-xs font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-[var(--hover)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={working || loading || !preview}
            className="px-3 py-1.5 text-xs font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {working && <Loader2 className="w-3 h-3 animate-spin" />}
            {working ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  strong
}: {
  label: string
  value: string
  strong?: boolean
}): React.ReactElement {
  return (
    <div className="flex justify-between items-center">
      <span className={strong ? 'font-medium text-[var(--t1)]' : 'text-[var(--t3)]'}>{label}</span>
      <span className={strong ? 'font-semibold text-[var(--t1)]' : 'text-[var(--t2)]'}>
        {value}
      </span>
    </div>
  )
}
