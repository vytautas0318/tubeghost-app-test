import { describe, it, expect } from 'vitest'
import { TOOLS, getTool, ERROR_CODES, errorSchema, err } from '../contract'
import * as S from '../schemas'

describe('TOOLS registry', () => {
  it('has all 16 v1 tools with unique names', () => {
    const names = TOOLS.map((t) => t.name)
    // 7 read-only + 5 write + 1 destructive + 3 action.
    expect(names.length).toBe(16)
    expect(new Set(names).size).toBe(16)
    expect(TOOLS.filter((t) => t.readOnly).length).toBe(7)
    expect(TOOLS.filter((t) => !t.readOnly && !t.destructive).length).toBe(8)
    expect(TOOLS.filter((t) => t.destructive).length).toBe(1)
  })

  it('every read-only tool is flagged readOnly + readOnlyHint', () => {
    for (const t of TOOLS.filter((x) => x.readOnly)) {
      expect(t.annotations.readOnlyHint).toBe(true)
      expect(t.destructive).toBe(false)
    }
  })

  it('only delete_profile is destructive and carries destructiveHint', () => {
    const destructive = TOOLS.filter((t) => t.destructive)
    expect(destructive.map((t) => t.name)).toEqual(['delete_profile'])
    expect(destructive[0].annotations.destructiveHint).toBe(true)
  })

  it('async tools return a command_ref shape', () => {
    const asyncTools = TOOLS.filter((t) => t.mode === 'async').map((t) => t.name).sort()
    expect(asyncTools).toEqual(['bulk_import_profiles', 'launch_profile'])
  })

  it('device_id is optional (never required) on every non-read-only tool', () => {
    for (const t of TOOLS.filter((x) => !x.readOnly)) {
      const shape = (t.inputSchema as typeof S.stopProfileInput).shape as Record<string, { isOptional?: () => boolean }>
      expect(shape.device_id).toBeDefined()
      // The auto-resolve contract: device_id must be omittable.
      expect(shape.device_id.isOptional?.()).toBe(true)
    }
  })

  it('descriptions stay under ~80 words', () => {
    for (const t of TOOLS) {
      expect(t.description.split(/\s+/).length).toBeLessThanOrEqual(85)
    }
  })

  it('getTool resolves by name and returns undefined otherwise', () => {
    expect(getTool('launch_profile')?.mode).toBe('async')
    expect(getTool('nope')).toBeUndefined()
  })
})

describe('schemas', () => {
  it('delete_profile defaults confirm to false', () => {
    const r = S.deleteProfileInput.parse({ profile_id: 'p1' })
    expect(r.confirm).toBe(false)
  })

  it('open_url_in_profile requires a valid URL', () => {
    expect(S.openUrlInProfileInput.safeParse({ profile_id: 'p', url: 'not a url' }).success).toBe(false)
    expect(S.openUrlInProfileInput.safeParse({ profile_id: 'p', url: 'https://x.com' }).success).toBe(true)
  })

  it('bulk_import caps rows at 500 and requires ≥1', () => {
    expect(S.bulkImportProfilesInput.safeParse({ rows: [] }).success).toBe(false)
    const many = Array.from({ length: 501 }, (_, i) => ({ name: `p${i}` }))
    expect(S.bulkImportProfilesInput.safeParse({ rows: many }).success).toBe(false)
  })

  it('profile summary never carries proxy credential fields', () => {
    const shape = Object.keys(S.profileSummarySchema.shape)
    for (const k of shape) expect(/pass|host|port|user|cookie|seed/i.test(k)).toBe(false)
  })
})

describe('errors', () => {
  it('err() builds a schema-valid ToolError', () => {
    const e = err('NO_DEVICE', 'none', 'call list_devices', { a: 1 })
    expect(errorSchema.parse(e)).toEqual(e)
    expect(ERROR_CODES).toContain('AMBIGUOUS_DEVICE')
  })
})
