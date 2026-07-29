import { describe, it, expect } from 'vitest'
import { redactArgs } from '../redact.js'

describe('redactArgs', () => {
  it('redacts secret-bearing keys', () => {
    const out = redactArgs({
      profile_id: 'p1',
      proxy_pass: 'hunter2',
      proxy_host: '1.2.3.4',
      api_key: 'sk-abc',
      token: 't',
      cookie: 'sid=1',
      password: 'x',
    })
    expect(out.profile_id).toBe('p1')
    expect(out.proxy_pass).toBe('[redacted]')
    expect(out.proxy_host).toBe('[redacted]')
    expect(out.api_key).toBe('[redacted]')
    expect(out.token).toBe('[redacted]')
    expect(out.cookie).toBe('[redacted]')
    expect(out.password).toBe('[redacted]')
  })

  it('recurses into nested objects and arrays', () => {
    const out = redactArgs({ rows: [{ name: 'a', proxy_user: 'u' }] })
    expect((out.rows as { name: string; proxy_user: string }[])[0]).toEqual({ name: 'a', proxy_user: '[redacted]' })
  })

  it('truncates very long strings', () => {
    const out = redactArgs({ notes: 'x'.repeat(999) })
    expect((out.notes as string).length).toBeLessThanOrEqual(501)
  })

  it('never throws on circular refs', () => {
    const a: Record<string, unknown> = { name: 'x' }
    a.self = a
    expect(() => redactArgs(a)).not.toThrow()
  })
})
