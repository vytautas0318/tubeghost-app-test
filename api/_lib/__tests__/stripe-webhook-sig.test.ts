import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyWebhookSignature } from '../stripe.js'

const SECRET = 'whsec_test_secret'
const BODY = '{"id":"evt_1","type":"checkout.session.completed"}'
const NOW = 1_700_000_000_000 // fixed clock so the tolerance window is deterministic

function sign(body: string, secret: string, tsSec: number): string {
  const v1 = createHmac('sha256', secret).update(`${tsSec}.${body}`, 'utf8').digest('hex')
  return `t=${tsSec},v1=${v1}`
}

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed payload', () => {
    const header = sign(BODY, SECRET, NOW / 1000)
    expect(verifyWebhookSignature(BODY, header, SECRET, 300, NOW)).toBe(true)
  })

  it('rejects a payload signed with the wrong secret', () => {
    const header = sign(BODY, 'whsec_attacker', NOW / 1000)
    expect(verifyWebhookSignature(BODY, header, SECRET, 300, NOW)).toBe(false)
  })

  it('rejects a tampered body', () => {
    // The attack that matters: a valid signature replayed over an edited
    // payload — e.g. profile_quota bumped to a million.
    const header = sign(BODY, SECRET, NOW / 1000)
    const tampered = BODY.replace('evt_1', 'evt_2')
    expect(verifyWebhookSignature(tampered, header, SECRET, 300, NOW)).toBe(false)
  })

  it('rejects a stale timestamp outside the tolerance', () => {
    const header = sign(BODY, SECRET, NOW / 1000 - 600)
    expect(verifyWebhookSignature(BODY, header, SECRET, 300, NOW)).toBe(false)
  })

  it('accepts a timestamp inside the tolerance', () => {
    const header = sign(BODY, SECRET, NOW / 1000 - 100)
    expect(verifyWebhookSignature(BODY, header, SECRET, 300, NOW)).toBe(true)
  })

  it('rejects a future timestamp beyond tolerance', () => {
    const header = sign(BODY, SECRET, NOW / 1000 + 600)
    expect(verifyWebhookSignature(BODY, header, SECRET, 300, NOW)).toBe(false)
  })

  it('accepts when one of several v1 signatures matches (secret rotation)', () => {
    const ts = NOW / 1000
    const good = createHmac('sha256', SECRET).update(`${ts}.${BODY}`, 'utf8').digest('hex')
    const header = `t=${ts},v1=${'0'.repeat(64)},v1=${good}`
    expect(verifyWebhookSignature(BODY, header, SECRET, 300, NOW)).toBe(true)
  })

  it('fails closed on missing or malformed input', () => {
    expect(verifyWebhookSignature(BODY, undefined, SECRET, 300, NOW)).toBe(false)
    expect(verifyWebhookSignature(BODY, '', SECRET, 300, NOW)).toBe(false)
    expect(verifyWebhookSignature(BODY, 'garbage', SECRET, 300, NOW)).toBe(false)
    expect(verifyWebhookSignature(BODY, `t=abc,v1=${'0'.repeat(64)}`, SECRET, 300, NOW)).toBe(false)
    // No signature scheme we recognise (v0 is Stripe's test-mode scheme).
    expect(verifyWebhookSignature(BODY, `t=${NOW / 1000},v0=deadbeef`, SECRET, 300, NOW)).toBe(false)
  })

  it('fails closed when no secret is configured', () => {
    const header = sign(BODY, SECRET, NOW / 1000)
    expect(verifyWebhookSignature(BODY, header, '', 300, NOW)).toBe(false)
  })
})
