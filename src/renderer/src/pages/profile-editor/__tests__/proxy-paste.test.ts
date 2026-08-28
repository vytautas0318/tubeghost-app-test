import { describe, expect, it } from 'vitest'
import { parsePastedProxy } from '../proxyPasteParse'

describe('parsePastedProxy — accepted formats', () => {
  it('parses ip:port using the default protocol', () => {
    const r = parsePastedProxy('198.51.100.42:8080', 'http')
    expect(r).toEqual({
      ok: true,
      fields: { type: 'http', host: '198.51.100.42', port: '8080', user: '', pass: '' }
    })
  })

  it('parses ip:port:user:pass', () => {
    const r = parsePastedProxy('198.51.100.42:8080:bob:s3cret', 'http')
    expect(r.ok).toBe(true)
    if (r.ok === true) {
      expect(r.fields).toEqual({
        type: 'http',
        host: '198.51.100.42',
        port: '8080',
        user: 'bob',
        pass: 's3cret'
      })
    }
  })

  it('parses user:pass@ip:port', () => {
    const r = parsePastedProxy('bob:s3cret@198.51.100.42:8080', 'http')
    expect(r.ok).toBe(true)
    if (r.ok === true) expect(r.fields.user).toBe('bob')
  })

  // A scheme in the line must beat the tab's currently-selected protocol,
  // matching the Add proxies panel's "lines that include their own scheme://
  // override this" behaviour.
  it('lets an explicit scheme override the default protocol', () => {
    const r = parsePastedProxy('socks5://198.51.100.42:1080:bob:s3cret', 'http')
    expect(r.ok).toBe(true)
    if (r.ok === true) expect(r.fields.type).toBe('socks5')
  })

  it('honours the default protocol when the line has no scheme', () => {
    const r = parsePastedProxy('198.51.100.42:1080', 'socks5')
    expect(r.ok).toBe(true)
    if (r.ok === true) expect(r.fields.type).toBe('socks5')
  })

  it('tolerates surrounding whitespace and trailing newlines', () => {
    const r = parsePastedProxy('  198.51.100.42:8080  \n\n', 'http')
    expect(r.ok).toBe(true)
    if (r.ok === true) expect(r.fields.host).toBe('198.51.100.42')
  })
})

describe('parsePastedProxy — rejections', () => {
  it('treats empty input as a no-op, not an error', () => {
    expect(parsePastedProxy('', 'http')).toEqual({ ok: 'empty' })
    expect(parsePastedProxy('   \n  ', 'http')).toEqual({ ok: 'empty' })
  })

  it('treats a comment-only paste as empty', () => {
    expect(parsePastedProxy('# just a note', 'http')).toEqual({ ok: 'empty' })
  })

  // This tab sets ONE proxy on ONE profile, so a bulk paste must be refused
  // rather than silently using line 1 and discarding the rest.
  it('refuses a multi-line paste', () => {
    const r = parsePastedProxy('1.1.1.1:8080\n2.2.2.2:9090', 'http')
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.error).toMatch(/one proxy at a time/i)
  })

  it('ignores comments when counting lines', () => {
    const r = parsePastedProxy('# my proxy\n1.1.1.1:8080', 'http')
    expect(r.ok).toBe(true)
  })

  it('reports an unparseable line', () => {
    const r = parsePastedProxy('not-a-proxy', 'http')
    expect(r.ok).toBe(false)
  })
})
