import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// stripe-env reads process.env at module scope, so each case needs a fresh
// import after setting the environment.
async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return await import('../stripe-env.js')
}

const ORIGINAL = { ...process.env }

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY
  delete process.env.TG_DISABLE_AUTOMATIC_TAX
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  vi.resetModules()
})

describe('automatic tax toggle', () => {
  it('is on by default in test mode', async () => {
    const env = await loadEnv({ STRIPE_SECRET_KEY: 'sk_test_abc' })
    expect(env.automaticTaxEnabled()).toBe(true)
  })

  it('is on by default in live mode', async () => {
    const env = await loadEnv({ STRIPE_SECRET_KEY: 'sk_live_abc' })
    expect(env.automaticTaxEnabled()).toBe(true)
  })

  it('can be disabled in test mode', async () => {
    const env = await loadEnv({
      STRIPE_SECRET_KEY: 'sk_test_abc',
      TG_DISABLE_AUTOMATIC_TAX: 'true'
    })
    expect(env.automaticTaxEnabled()).toBe(false)
  })

  it('CANNOT be disabled in live mode, even when the flag is set', async () => {
    // The guarantee that matters: we sell into the EU/UK where VAT is a legal
    // requirement. A stray env var in production must never silently stop
    // collecting it.
    const env = await loadEnv({
      STRIPE_SECRET_KEY: 'sk_live_abc',
      TG_DISABLE_AUTOMATIC_TAX: 'true'
    })
    expect(env.automaticTaxEnabled()).toBe(true)
  })

  it('stays on for any non-exact flag value', async () => {
    for (const v of ['1', 'yes', 'TRUE', '']) {
      const env = await loadEnv({ STRIPE_SECRET_KEY: 'sk_test_abc', TG_DISABLE_AUTOMATIC_TAX: v })
      expect(env.automaticTaxEnabled()).toBe(true)
    }
  })

  it('treats a missing key as not test mode, so tax stays on', async () => {
    const env = await loadEnv({
      STRIPE_SECRET_KEY: undefined,
      TG_DISABLE_AUTOMATIC_TAX: 'true'
    })
    expect(env.isTestMode()).toBe(false)
    expect(env.automaticTaxEnabled()).toBe(true)
  })
})
