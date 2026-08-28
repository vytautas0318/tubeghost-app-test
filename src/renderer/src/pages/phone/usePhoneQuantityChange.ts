// Preview -> confirm -> commit state for an in-app phone quantity/cycle change.
//
// Mirrors tubeproxies-dash's QuantityChangeModal: fetch the preview when the
// user picks a tile, hold it while they read the numbers, and only mutate on an
// explicit confirm.

import { useState } from 'react'
import type { PhoneBillingPeriod } from './phoneCheckout'
import {
  commitPhoneChange,
  previewPhoneChange,
  type PhoneChangePreview
} from './phoneQuantityChange'

export interface UsePhoneQuantityChange {
  /** Tile the modal is open for, or null when closed. */
  target: { quantity: number; period: PhoneBillingPeriod } | null
  preview: PhoneChangePreview | null
  previewLoading: boolean
  committing: boolean
  error: string | null
  open: (quantity: number, period: PhoneBillingPeriod) => void
  cancel: () => void
  confirm: () => void
}

export function usePhoneQuantityChange({
  onDone,
  onNeedsPayment,
  onToast
}: {
  onDone: (message: string) => void
  onNeedsPayment: (url: string) => void
  onToast: (kind: 'info', text: string) => void
}): UsePhoneQuantityChange {
  const [target, setTarget] = useState<{ quantity: number; period: PhoneBillingPeriod } | null>(
    null
  )
  const [preview, setPreview] = useState<PhoneChangePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = (quantity: number, period: PhoneBillingPeriod): void => {
    setTarget({ quantity, period })
    setPreview(null)
    setError(null)
    setPreviewLoading(true)
    void previewPhoneChange(quantity, period)
      .then(setPreview)
      .catch((e: Error) => setError(e.message))
      .finally(() => setPreviewLoading(false))
  }

  const cancel = (): void => setTarget(null)

  const confirm = (): void => {
    if (!target || committing) return
    // Reducing the count needs the user to say WHICH numbers to release; that
    // picker is not built in the app yet, so refuse rather than send an empty
    // list the server would (correctly) reject.
    if (preview?.requiresNumberSelection) {
      setError(
        'Choosing which numbers to release is not available in the app yet — use the TubeProxies dashboard for this change.'
      )
      return
    }
    setCommitting(true)
    setError(null)
    void commitPhoneChange(target.quantity, target.period)
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
