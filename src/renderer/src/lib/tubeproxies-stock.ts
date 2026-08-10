// Live stock for proxies and phone numbers, so TubeGhost never offers
// something TubeProxies can't fulfil.
//
// Without this the two products disagree: TubeGhost shows six buyable proxy
// tiers while the dashboard shows every one "Out of stock", and the user only
// discovers the truth after being bounced out of checkout.
//
// Two different sources, because the two products track stock differently:
//
//   Proxies — `get_available_inventory_count()`, a SECURITY DEFINER RPC in
//     the shared database that is explicitly granted to `authenticated`
//     (tubeproxies-dash migration 026). We call it directly; no HTTP hop.
//
//   Phone numbers — derived from the upstream TextVerified account balance,
//     which needs credentials that must never ship in a client. Only the
//     dashboard can compute it, so we degrade gracefully rather than guess
//     (see phoneStock below).

import { getPublicSchema } from './supabase'

export type StockState = 'in_stock' | 'limited' | 'sold_out' | 'unknown'

export interface ProxyStock {
  /** Proxies currently unassigned in inventory. Null when the count failed. */
  available: number | null
}

/**
 * How many proxies TubeProxies can hand out right now.
 *
 * Returns null on any failure. Callers must treat null as "unknown" and keep
 * the buy button enabled — the checkout endpoint re-checks inventory server
 * side and refuses properly, so a failed count must not block a legitimate
 * purchase.
 */
export async function getProxyStock(): Promise<ProxyStock> {
  try {
    const schema = getPublicSchema()
    if (!schema) return { available: null }
    const { data, error } = await schema.rpc('get_available_inventory_count')
    if (error || typeof data !== 'number') return { available: null }
    return { available: data }
  } catch {
    return { available: null }
  }
}

/**
 * Whether a proxy tier of `size` can be fulfilled.
 *
 * Mirrors the dashboard's plan-availability rule for a NEW subscriber: the
 * full plan quantity must be in stock. (Existing subscribers upgrading only
 * need the difference, but that path goes through the dashboard's upgrade
 * flow, not ours.)
 */
export function canFulfilProxyTier(available: number | null, size: number): boolean {
  if (available === null) return true // unknown → don't block
  return available >= size
}

/** Below this the dashboard stops showing a count and says "sold out". */
const PHONE_SOLD_OUT_THRESHOLD = 5

export interface PhoneStock {
  state: StockState
  /** Estimated numbers available; null when unknown or deliberately hidden. */
  estimatedAvailable: number | null
}

/**
 * Phone-number availability.
 *
 * The real signal lives behind the dashboard's `/api/phone-numbers/
 * availability` endpoint because it needs the TextVerified API key. We can't
 * call that cross-origin with the user's session, so until a shared source
 * exists this reports 'unknown' and the UI shows no stock pill rather than a
 * wrong one.
 *
 * Deliberately NOT guessed from any local table: `public.phone_numbers` holds
 * numbers already sold, which says nothing about what's left to sell.
 */
export async function getPhoneStock(): Promise<PhoneStock> {
  return { state: 'unknown', estimatedAvailable: null }
}

/** Bucket a raw count the way the dashboard does, for consistent copy. */
export function phoneStateFor(estimated: number | null): StockState {
  if (estimated === null) return 'unknown'
  return estimated < PHONE_SOLD_OUT_THRESHOLD ? 'sold_out' : 'in_stock'
}
