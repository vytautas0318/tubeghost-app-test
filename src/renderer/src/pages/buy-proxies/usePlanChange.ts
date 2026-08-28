// Preview -> confirm -> commit state for an in-app plan change.
//
// Modelled on tubeproxies-dash/src/hooks/billing/usePlanChange.ts: fetch the
// preview when the user picks a plan, hold it while they read the numbers,
// and only mutate on an explicit confirm.
//
// Split out of BuyProxies.tsx to keep that page under the 250-line rule.

import { useState } from 'react'
import type { ProxyCycle } from './checkoutLink'
import { commitPlanChange, previewPlanChange, type PlanChangePreview } from './planChange'

export interface UsePlanChange {
  /** Plan the modal is open for, or null when closed. */
  target: string | null
  preview: PlanChangePreview | null
  previewLoading: boolean
  committing: boolean
  error: string | null
  open: (planName: string) => void
  cancel: () => void
  confirm: () => void
}

export function usePlanChange({
  term,
  onDone,
  onNeedsPayment,
  onToast
}: {
  term: ProxyCycle
  /** Called after a change lands, so the caller can re-read plan status. */
  onDone: (message: string) => void
  /** 3DS/SCA: the prorated invoice must be authorised before money moves. */
  onNeedsPayment: (url: string) => void
  onToast: (kind: 'info', text: string) => void
}): UsePlanChange {
  const [target, setTarget] = useState<string | null>(null)
  const [preview, setPreview] = useState<PlanChangePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = (planName: string): void => {
    setTarget(planName)
    setPreview(null)
    setError(null)
    setPreviewLoading(true)
    void previewPlanChange(planName, term)
      .then(setPreview)
      .catch((e: Error) => setError(e.message))
      .finally(() => setPreviewLoading(false))
  }

  const cancel = (): void => setTarget(null)

  const confirm = (): void => {
    if (!target || committing) return
    // A tier downgrade must name which proxies to release; that picker is not
    // built in the app yet, so refuse rather than send an empty list the
    // server would (correctly) reject.
    if (preview?.requiresProxySelection) {
      setError(
        'Choosing which proxies to release is not available in the app yet — use the TubeProxies dashboard for this change.'
      )
      return
    }
    setCommitting(true)
    setError(null)
    void commitPlanChange(target, term)
      .then((r) => {
        if (!r.success && r.requiresPayment) {
          setTarget(null)
          onNeedsPayment(r.redirect_url)
          onToast('info', 'Finish authorising the payment in your browser.')
          return
        }
        if (r.success) {
          setTarget(null)
          onDone(r.message)
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCommitting(false))
  }

  return { target, preview, previewLoading, committing, error, open, cancel, confirm }
}
