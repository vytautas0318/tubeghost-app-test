import * as React from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'

/**
 * Shown when the customer returns from the single checkout page.
 *
 * Stripe has saved the card, but the subscriptions are created by the
 * webhook a moment later — so the entitlement is not visible yet. Claiming
 * success immediately would show the old plan and look broken; claiming
 * failure would be wrong. So: say what is happening, then reload once the
 * work has had time to land.
 *
 * Reloading is deliberate rather than polling an endpoint: every figure on
 * this page (plan, limits, subscriptions) comes from hooks that read on
 * mount, so one reload refreshes all of them consistently.
 */
const SETTLE_MS = 4000

export function ProcessingNotice({ onDone }: { onDone: () => void }): React.ReactElement {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const settle = setTimeout(() => {
      onDone()
      window.location.reload()
    }, SETTLE_MS)
    // If the reload has not happened by now something is wrong upstream —
    // offer a manual escape rather than spinning forever.
    const stuck = setTimeout(() => setSlow(true), SETTLE_MS * 3)
    return () => {
      clearTimeout(settle)
      clearTimeout(stuck)
    }
  }, [onDone])

  return (
    <div className="bill-order-note">
      <div>
        <strong>Setting up your subscription…</strong> Your payment went through — we&apos;re
        activating everything you bought. This takes a few seconds.
      </div>
      {slow && (
        <div className="bill-order-actions">
          <Button size="sm" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      )}
    </div>
  )
}
