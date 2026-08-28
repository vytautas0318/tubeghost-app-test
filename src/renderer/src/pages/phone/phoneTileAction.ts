// Tile labelling for the phone price ladder.
//
// A deliberately SMALL renderer mirror of the server classifier
// (supabase/functions/_shared/phone-quantity-action.ts). It decides only what
// the button says; the server decides what actually happens, re-classifying
// every preview and commit from the live Stripe subscription. A client that
// disagreed here could still never talk the server into the wrong action.
//
// Why not import the server module: it lives under supabase/functions, which
// deploys separately and is not on the renderer's module graph. Aliasing into
// it would pull Deno-targeted code into the Electron bundle.
//
// phone-tile-action.test.ts asserts this agrees with the server classifier
// across the whole quantity x interval matrix, so the two cannot drift.

export type PhoneTilePeriod = 'monthly' | 'quarterly' | 'annual'

export interface PhoneTileState {
  quantity: number
  /** ISO strings from the overview row; the cycle is derived from their span. */
  periodStart: string | null
  periodEnd: string | null
}

export interface PhoneTileAction {
  kind: 'select' | 'current' | 'upgrade' | 'downgrade'
  label: string
  disabled: boolean
}

const RANK: Record<PhoneTilePeriod, number> = { monthly: 1, quarterly: 3, annual: 12 }
const LABEL: Record<PhoneTilePeriod, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual'
}

/** Wide bands: real periods vary (28-31 day months, leap years, proration). */
const BANDS: Array<{ maxDays: number; period: PhoneTilePeriod }> = [
  { maxDays: 45, period: 'monthly' },
  { maxDays: 135, period: 'quarterly' },
  { maxDays: 400, period: 'annual' }
]

export function cycleFromPeriod(
  start: string | null | undefined,
  end: string | null | undefined
): PhoneTilePeriod | null {
  if (!start || !end) return null
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null
  const days = (b - a) / 86_400_000
  return BANDS.find((x) => days <= x.maxDays)?.period ?? null
}

export function phoneTileAction(
  current: PhoneTileState | null,
  targetQuantity: number,
  targetPeriod: PhoneTilePeriod
): PhoneTileAction {
  if (!current || current.quantity < 1) {
    return { kind: 'select', label: 'Get numbers', disabled: false }
  }

  const currentPeriod = cycleFromPeriod(current.periodStart, current.periodEnd)

  if (targetQuantity === current.quantity) {
    // Cycle unknown, or the same: nothing to offer.
    if (!currentPeriod || RANK[targetPeriod] === RANK[currentPeriod]) {
      return { kind: 'current', label: 'Current plan', disabled: true }
    }
    return RANK[targetPeriod] > RANK[currentPeriod]
      ? { kind: 'upgrade', label: `Upgrade to ${LABEL[targetPeriod]}`, disabled: false }
      : { kind: 'downgrade', label: `Downgrade to ${LABEL[targetPeriod]}`, disabled: false }
  }

  // Quantity is the primary axis, exactly as on the server.
  return targetQuantity > current.quantity
    ? { kind: 'upgrade', label: 'Upgrade', disabled: false }
    : { kind: 'downgrade', label: 'Downgrade', disabled: false }
}
