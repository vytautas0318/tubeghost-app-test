// Reacting to a Stripe checkout that finished in the system browser.
//
// The deep link (`tubeghost://billing?checkout=success`) lands the user back in
// the app, but the plan is NOT yet updated: Stripe redirects the browser the
// moment payment succeeds, while the entitlement is written by our webhook a
// beat later. Reading once on arrival almost always shows the OLD plan.
//
// So poll until the data actually changes, then stop. Polling — not a realtime
// subscription — because the write comes from the service-role webhook, and the
// row is behind RLS that the client cannot subscribe to for another workspace.

import { useEffect, useRef, useState } from 'react'

/** How long to keep looking before giving up and letting the user refresh. */
const MAX_WAIT_MS = 30_000
const INTERVAL_MS = 2_000

export type CheckoutOutcome = 'success' | 'cancelled' | null

export interface CheckoutReturn {
  /** What Stripe reported, or null when this was not a checkout return. */
  outcome: CheckoutOutcome
  /** True while waiting for the webhook's write to land. */
  settling: boolean
  /** Dismiss the banner. */
  clear: () => void
}

/**
 * @param outcome     `checkout` query param from the deep link
 * @param signature   a value that CHANGES when the subscription changes —
 *                    polling stops as soon as it differs from what we saw on
 *                    arrival. Passing a stable value would poll for the full
 *                    timeout on every return.
 * @param refresh     re-reads billing data
 */
export function useCheckoutReturn(
  outcome: CheckoutOutcome,
  signature: string,
  refresh: () => void
): CheckoutReturn {
  const [settling, setSettling] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  // The signature at the moment we returned. Captured in a ref so the polling
  // effect does not restart every time `signature` changes.
  const baseline = useRef<string | null>(null)

  useEffect(() => {
    if (outcome !== 'success') return
    baseline.current = signature
    setSettling(true)

    const started = Date.now()
    const timer = setInterval(() => {
      // The webhook landed: the plan we are looking at is no longer the one we
      // arrived with.
      if (baseline.current !== null && signature !== baseline.current) {
        setSettling(false)
        clearInterval(timer)
        return
      }
      if (Date.now() - started > MAX_WAIT_MS) {
        // Give up quietly. The purchase is fine — Stripe took the money — but
        // the webhook is slow or failed, and a spinner that never resolves is
        // worse than a plain "refresh to see it" state.
        setSettling(false)
        clearInterval(timer)
        return
      }
      refresh()
    }, INTERVAL_MS)

    return () => clearInterval(timer)
    // `signature` is deliberately absent: including it would restart the poll
    // on every refresh, and the fresh value is read through the closure below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, refresh])

  // Read the live signature each tick without re-arming the interval.
  useEffect(() => {
    if (!settling) return
    if (baseline.current !== null && signature !== baseline.current) setSettling(false)
  }, [signature, settling])

  return {
    outcome: dismissed ? null : outcome,
    settling,
    clear: () => setDismissed(true)
  }
}
