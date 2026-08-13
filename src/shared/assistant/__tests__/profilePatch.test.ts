import { describe, it, expect } from 'vitest'
import { parsePatchResponse } from '../profilePatch'

// This parser is the boundary between model output and the profile row.
// Everything it lets through gets applied to a real profile, so the tests
// are mostly about what it must REJECT.
describe('parsePatchResponse', () => {
  it('parses a well-formed multi-change response', () => {
    const r = parsePatchResponse({
      changes: [
        { kind: 'set_os', os: 'macos' },
        { kind: 'set_proxy', query: 'Dallas' },
        { kind: 'add_tags', names: ['flagship', 'warm'] }
      ]
    })
    expect(r.errors).toEqual([])
    expect(r.intents).toEqual([
      { kind: 'set_os', os: 'macos' },
      { kind: 'set_proxy', query: 'Dallas' },
      { kind: 'add_tags', names: ['flagship', 'warm'] }
    ])
  })

  it('drops an unknown action instead of guessing', () => {
    const r = parsePatchResponse({
      changes: [{ kind: 'delete_profile' }, { kind: 'new_fingerprint' }]
    })
    expect(r.intents).toEqual([{ kind: 'new_fingerprint' }])
    expect(r.errors[0]).toMatch(/unsupported "delete_profile"/)
  })

  it('rejects an OS it cannot honour', () => {
    const r = parsePatchResponse({ changes: [{ kind: 'set_os', os: 'linux' }] })
    expect(r.intents).toEqual([])
    expect(r.errors[0]).toMatch(/windows or macos/)
  })

  it('rejects a proxy change with no query rather than picking one', () => {
    const r = parsePatchResponse({ changes: [{ kind: 'set_proxy', query: '  ' }] })
    expect(r.intents).toEqual([])
    expect(r.errors[0]).toMatch(/needs a query/)
  })

  it('treats set_optimized as ON unless explicitly false', () => {
    expect(parsePatchResponse({ changes: [{ kind: 'set_optimized' }] }).intents).toEqual([
      { kind: 'set_optimized', on: true }
    ])
    expect(
      parsePatchResponse({ changes: [{ kind: 'set_optimized', on: false }] }).intents
    ).toEqual([{ kind: 'set_optimized', on: false }])
  })

  it('caps runaway names and de-duplicates tags', () => {
    const long = 'x'.repeat(500)
    const r = parsePatchResponse({
      changes: [
        { kind: 'set_name', name: long },
        { kind: 'add_tags', names: ['a', 'a', ' a ', 'b'] }
      ]
    })
    const name = r.intents.find((i) => i.kind === 'set_name')
    expect(name && 'name' in name && name.name.length).toBe(80)
    const tags = r.intents.find((i) => i.kind === 'add_tags')
    expect(tags && 'names' in tags && tags.names).toEqual(['a', 'b'])
  })

  it('bounds how many changes one response can make', () => {
    const changes = Array.from({ length: 40 }, () => ({ kind: 'new_fingerprint' }))
    expect(parsePatchResponse({ changes }).intents.length).toBe(12)
  })

  it('keeps a prose reply when there are no changes', () => {
    const r = parsePatchResponse({ changes: [], reply: 'I can set the device or proxy.' })
    expect(r.intents).toEqual([])
    expect(r.reply).toBe('I can set the device or proxy.')
  })

  it('survives junk', () => {
    expect(parsePatchResponse(null).errors.length).toBe(1)
    expect(parsePatchResponse('nope').errors.length).toBe(1)
    expect(parsePatchResponse({ changes: 'not-an-array' }).intents).toEqual([])
  })
})
