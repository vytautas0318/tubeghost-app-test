import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB layer so token auth is pure (no network).
const rows = new Map<string, unknown>()
vi.mock('../db.js', () => ({
  getDeviceByTokenHash: vi.fn(async (col: string, hash: string) => rows.get(`${col}:${hash}`) ?? null),
}))

import { hashToken, mintTokenPair, authenticateAgent, authenticateRefresh } from '../device-token.js'

beforeEach(() => rows.clear())

describe('token hashing + minting', () => {
  it('mints prefixed access + refresh tokens', () => {
    const { token, refreshToken } = mintTokenPair()
    expect(token.startsWith('tgd_')).toBe(true)
    expect(refreshToken.startsWith('tgr_')).toBe(true)
    expect(token).not.toBe(refreshToken)
  })

  it('hashToken is deterministic sha256 hex', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })
})

describe('authenticateAgent', () => {
  it('rejects a token without the access prefix', async () => {
    const r = await authenticateAgent('tgr_wrongkind')
    expect(r).toEqual({ ok: false, reason: 'missing' })
  })

  it('rejects an unknown token', async () => {
    expect((await authenticateAgent('tgd_nope')).ok).toBe(false)
  })

  it('accepts a known, non-revoked device', async () => {
    const { token } = mintTokenPair()
    const device = { id: 'd1', revoked_at: null }
    rows.set(`token_hash:${hashToken(token)}`, device)
    const r = await authenticateAgent(token)
    expect(r).toEqual({ ok: true, device })
  })

  it('rejects a revoked device even if the hash matches', async () => {
    const { token } = mintTokenPair()
    rows.set(`token_hash:${hashToken(token)}`, { id: 'd1', revoked_at: '2026-01-01' })
    expect(await authenticateAgent(token)).toEqual({ ok: false, reason: 'revoked' })
  })
})

describe('authenticateRefresh', () => {
  it('rotation: a new pair produces a different hash than the old', () => {
    const a = mintTokenPair()
    const b = mintTokenPair()
    expect(hashToken(a.refreshToken)).not.toBe(hashToken(b.refreshToken))
  })

  it('only matches on the refresh_token column', async () => {
    const { refreshToken } = mintTokenPair()
    rows.set(`refresh_token_hash:${hashToken(refreshToken)}`, { id: 'd1', revoked_at: null })
    expect((await authenticateRefresh(refreshToken)).ok).toBe(true)
    expect((await authenticateAgent(refreshToken)).ok).toBe(false) // wrong prefix
  })
})
