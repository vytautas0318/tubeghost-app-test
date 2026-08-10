// Map TubeProxies subscription rows into the Billing page's display shape.
//
// Kept out of the page so the formatting rules (status → badge tone, renewal
// wording) are testable and identical across both add-on tabs.

import type { Sub } from './SubList'
import type { PhoneSubRow, ProxySubRow } from './useSubscriptions'

/** Badge tone per Stripe status. past_due is the one that needs attention. */
function toneFor(status: string, cancelling: boolean): Sub['tone'] {
  if (status === 'past_due') return 'red'
  if (cancelling) return 'amber'
  return 'green'
}

function stateFor(status: string, cancelling: boolean): string {
  if (status === 'past_due') return 'Past due'
  if (cancelling) return 'Ending'
  if (status === 'trialing') return 'Trial'
  return 'Active'
}

/**
 * Renewal wording. A subscription set to cancel says when access *ends*,
 * not when it renews — showing "Renews" for something that won't is the
 * kind of detail that generates support tickets.
 */
function renewalFor(periodEnd: string | null, cancelling: boolean): string {
  if (!periodEnd) return '—'
  const when = new Date(periodEnd).toLocaleDateString()
  return cancelling ? `Ends ${when}` : `Renews ${when}`
}

export function proxySubToRow(r: ProxySubRow): Sub {
  const cancelling = r.cancel_at_period_end === true
  return {
    name: `${r.plan_name} · ${r.proxy_limit} ${r.proxy_limit === 1 ? 'IP' : 'IPs'}`,
    loc: 'US Static Residential',
    // Amount is intentionally omitted: the charged price lives in Stripe and
    // may include coupons, proration or a custom deal. Showing a guess from
    // the plan table would sometimes contradict the customer's invoice.
    amt: '',
    per: '',
    renew: renewalFor(r.current_period_end, cancelling),
    tone: toneFor(r.status, cancelling),
    state: stateFor(r.status, cancelling)
  }
}

export function phoneSubToRow(r: PhoneSubRow): Sub {
  const cancelling = r.cancel_at_period_end === true
  const n = r.number_quantity
  return {
    name: `${n} US ${n === 1 ? 'number' : 'numbers'}`,
    loc: 'SMS verification',
    amt: '',
    per: '',
    renew: renewalFor(r.current_period_end, cancelling),
    tone: toneFor(r.status, cancelling),
    state: stateFor(r.status, cancelling)
  }
}
