// Card on file + recent invoices, read from Stripe via `billing-info`.
//
// Split from useBilling so Settings → Billing can show the same real data
// without pulling in the full plan/usage data layer. Both surfaces call the
// same endpoint, so they cannot disagree.

import { useEffect, useState } from 'react'
import { billingApi } from './billingApi'
import type { Invoice, PaymentMethod } from './types'

export interface StripeInfo {
  paymentMethod: PaymentMethod | null
  invoices: Invoice[]
  loading: boolean
  error: string | null
}

const EMPTY: StripeInfo = {
  paymentMethod: null,
  invoices: [],
  loading: true,
  error: null
}

export function useStripeInfo(workspaceId: string | null): StripeInfo {
  const [info, setInfo] = useState<StripeInfo>(EMPTY)

  useEffect(() => {
    let cancelled = false

    // State is set asynchronously so the effect body never calls setState
    // synchronously (react-hooks/set-state-in-effect).
    if (!workspaceId) {
      queueMicrotask(() => {
        if (!cancelled) setInfo({ ...EMPTY, loading: false })
      })
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => {
      if (!cancelled) setInfo((s) => ({ ...s, loading: true, error: null }))
    })

    billingApi
      .fetchInfo(workspaceId)
      .then((res) => {
        if (cancelled) return
        setInfo({
          paymentMethod: res.paymentMethod,
          invoices: res.invoices,
          loading: false,
          error: null
        })
      })
      .catch((e: Error) => {
        if (cancelled) return
        setInfo({ paymentMethod: null, invoices: [], loading: false, error: e.message })
      })

    return () => {
      cancelled = true
    }
  }, [workspaceId])

  return info
}
