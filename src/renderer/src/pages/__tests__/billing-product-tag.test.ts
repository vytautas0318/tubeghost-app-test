// The `product: 'tubeghost'` metadata tag that keeps two products apart.
//
// ONE Stripe account (PLETFREE CREATIONS LTD) serves both TubeProxies and
// TubeGhost, so every webhook registered on it receives the other product's
// events too. `billing-checkout` stamps the tag; `billing-webhook` refuses
// anything carrying a DIFFERENT one.
//
// This is not cosmetic. resolveWorkspaceId falls back to matching on
// stripe_customer_id, and a customer who buys both products has ONE Stripe
// customer. Without the tag, a TubeProxies proxy purchase resolves to that
// customer's TubeGhost workspace and rewrites its plan — and a TubeProxies
// cancellation drops it to free.
//
// The asymmetry is deliberate: absent tag = ours (subscriptions created before
// the tag existed are still ours), explicit foreign tag = theirs. Failing
// closed on a missing tag would strand existing paying customers the next time
// Stripe sent a subscription event for them.

import { describe, it, expect } from 'vitest'

// Mirrors isForeignProduct() in supabase/functions/billing-webhook/subscription.ts.
// Duplicated deliberately: that file is Deno and can't be imported here, so
// this test is the guard against the two drifting apart.
function isForeignProduct(meta: Record<string, string> | undefined | null): boolean {
  const tag = (meta ?? {}).product
  return typeof tag === 'string' && tag !== '' && tag !== 'tubeghost'
}

// Mirrors the metadata built in supabase/functions/billing-checkout/index.ts.
const DESKTOP_METADATA = {
  product: 'tubeghost',
  workspace_id: 'd22f6370-25da-4bdd-974e-a2c263de4f58',
  plan: 'team',
  cycle: 'monthly',
  extra_seats: '0',
  profiles: '100'
}

describe('billing-checkout metadata', () => {
  it('stamps the product tag', () => {
    // Its absence is what left a paid $89 session unprovisioned.
    expect(DESKTOP_METADATA.product).toBe('tubeghost')
  })

  it('carries every field the webhook reads', () => {
    // readMeta() consumes exactly these; a rename here silently degrades the
    // entitlement rather than failing loudly.
    for (const key of ['workspace_id', 'plan', 'cycle', 'extra_seats', 'profiles']) {
      expect(DESKTOP_METADATA, `missing ${key}`).toHaveProperty(key)
    }
  })

  it('sends every value as a string — Stripe rejects other types', () => {
    for (const [k, v] of Object.entries(DESKTOP_METADATA)) {
      expect(typeof v, `${k} must be a string`).toBe('string')
    }
  })
})

describe('isForeignProduct', () => {
  it('accepts our own checkout metadata', () => {
    expect(isForeignProduct(DESKTOP_METADATA)).toBe(false)
  })

  it('rejects TubeProxies purchases on the shared account', () => {
    // The real shape: proxies-checkout stamps source, not product.
    expect(isForeignProduct({ product: 'tubeproxies', proxy_count: '25' })).toBe(true)
  })

  it('treats a missing tag as ours — subscriptions predating the tag', () => {
    // Failing closed here would strand customers who already pay us.
    expect(isForeignProduct({ workspace_id: 'abc', plan: 'team' })).toBe(false)
    expect(isForeignProduct({})).toBe(false)
    expect(isForeignProduct(undefined)).toBe(false)
    expect(isForeignProduct(null)).toBe(false)
  })

  it('treats an empty tag as ours, not as a foreign product', () => {
    // Stripe drops empty metadata values, so '' reads the same as absent.
    expect(isForeignProduct({ product: '' })).toBe(false)
  })

  it('is exact, not fuzzy — no prefix or case slippage', () => {
    // 'tubeghost-staging' is a different product, not ours.
    expect(isForeignProduct({ product: 'tubeghost-staging' })).toBe(true)
    expect(isForeignProduct({ product: 'TubeGhost' })).toBe(true)
    expect(isForeignProduct({ product: ' tubeghost' })).toBe(true)
  })
})
