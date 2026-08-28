import { describe, expect, it } from 'vitest'
import { draftDiffers, draftFromRow, validateDraft } from '../connectionDraft'
import type { ProxyRow } from '@/lib/proxies'

const row = {
  id: 'p1',
  workspace_id: 'w1',
  source: 'custom',
  proxy_type: 'http',
  host: '69.54.229.255',
  port: 54600,
  username: 'user',
  password_encrypted: 'pass'
} as unknown as ProxyRow

describe('draftFromRow', () => {
  it('stringifies the port and normalises null credentials to empty strings', () => {
    const d = draftFromRow({ ...row, username: null, password_encrypted: null } as ProxyRow)
    expect(d.port).toBe('54600')
    expect(d.username).toBe('')
    expect(d.password).toBe('')
  })
})

describe('validateDraft', () => {
  it('accepts a well-formed draft', () => {
    expect(validateDraft(draftFromRow(row))).toBeNull()
  })

  it('rejects an empty host', () => {
    expect(validateDraft({ ...draftFromRow(row), host: '  ' })).toMatch(/host is required/i)
  })

  it('rejects a host containing spaces', () => {
    expect(validateDraft({ ...draftFromRow(row), host: '1.2.3.4 :80' })).toMatch(/spaces/i)
  })

  // The DB has CHECK (port > 0 AND port <= 65535); catch it before the write.
  it.each(['0', '65536', '-1', '', 'abc', '80.5'])('rejects port %s', (port) => {
    expect(validateDraft({ ...draftFromRow(row), port })).toMatch(/port must be/i)
  })

  it('accepts the boundary ports', () => {
    expect(validateDraft({ ...draftFromRow(row), port: '1' })).toBeNull()
    expect(validateDraft({ ...draftFromRow(row), port: '65535' })).toBeNull()
  })
})

describe('draftDiffers', () => {
  it('is false for an untouched draft', () => {
    expect(draftDiffers(draftFromRow(row), row)).toBe(false)
  })

  it.each([
    ['proxy_type', { proxy_type: 'socks5' as const }],
    ['host', { host: '1.2.3.4' }],
    ['port', { port: '8080' }],
    ['username', { username: 'other' }],
    ['password', { password: 'other' }]
  ])('detects a changed %s', (_field, patch) => {
    expect(draftDiffers({ ...draftFromRow(row), ...patch }, row)).toBe(true)
  })

  it('treats whitespace-only credential edits as unchanged', () => {
    const d = { ...draftFromRow(row), username: ' user ' }
    expect(draftDiffers(d, row)).toBe(false)
  })

  it('detects clearing a credential that was set', () => {
    expect(draftDiffers({ ...draftFromRow(row), username: '' }, row)).toBe(true)
  })
})
