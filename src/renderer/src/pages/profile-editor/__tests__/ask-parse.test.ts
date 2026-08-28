import { describe, it, expect } from 'vitest'
import { parseAsk, type AskContext } from '../askParse'
import { rowToSimpleDraft } from '../useSimpleDraft'
import type { ProfileRow } from '@/lib/profiles'
import type { ProxyRow } from '@/lib/proxies'
import type { GroupRow } from '@/lib/groups'

const PROXIES = [
  { id: 'px1', host: '38.84.26.198', port: 5555, city: 'Dallas', country_code: 'US' },
  { id: 'px2', host: '38.84.26.176', port: 5556, city: 'Miami', country_code: 'US' }
] as unknown as ProxyRow[]

const GROUPS = [
  { id: 'g1', name: 'Crime Dynasty' },
  { id: 'g2', name: 'MrHousing' }
] as unknown as GroupRow[]

const baseRow = {
  id: 'p1',
  name: 'Test',
  platform: 'windows',
  brand_version: '150.0.0.0',
  fingerprint_seed: 111,
  google_optimized: false,
  webgl_vendor: null,
  tags: [],
  group_id: null
} as unknown as ProfileRow

const ctx = (over: Partial<AskContext> = {}): AskContext => ({
  draft: rowToSimpleDraft(baseRow),
  proxies: PROXIES,
  groups: GROUPS,
  knownTags: ['flagship', 'warm', 'clips'],
  currentProxyHost: null,
  ...over
})

describe('parseAsk', () => {
  it('returns nothing for empty or unmatched input', () => {
    expect(parseAsk('', ctx()).changes).toEqual([])
    expect(parseAsk('hello there', ctx()).changes).toEqual([])
  })

  it('sets the device from natural phrasing', () => {
    const r = parseAsk('Make it a mac profile', ctx())
    expect(r.patch.platform).toBe('macos')
    expect(r.changes).toContain('Device → macOS')
  })

  it('does not report a change when the value already matches', () => {
    // Draft is already windows — asking for windows is a no-op, not a "change".
    expect(parseAsk('make it windows', ctx()).changes).toEqual([])
  })

  it('matches a proxy by IP and by city', () => {
    expect(parseAsk('use 38.84.26.198', ctx()).proxy?.id).toBe('px1')
    expect(parseAsk('put it on the Dallas IP', ctx()).proxy?.id).toBe('px1')
    expect(parseAsk('move it to Miami', ctx()).proxy?.id).toBe('px2')
  })

  it('detaches the proxy only when one is attached', () => {
    expect(parseAsk('no proxy', ctx({ currentProxyHost: '38.84.26.198' })).proxy).toBeNull()
    // Nothing attached → nothing to report.
    expect(parseAsk('no proxy', ctx()).changes).toEqual([])
  })

  it('rerolls the fingerprint seed', () => {
    const r = parseAsk('fresh fingerprint', ctx())
    expect(typeof r.patch.fingerprint_seed).toBe('number')
    expect(r.patch.fingerprint_seed).not.toBe(111)
    expect(r.changes).toContain('New fingerprint seed')
  })

  it('turns the YouTube preset on, applying the whole preset', () => {
    const r = parseAsk('optimized for YouTube', ctx())
    expect(r.patch.google_optimized).toBe(true)
    expect(r.patch.webrtc_mode).toBe('forward')
    expect(r.patch.timezone_mode).toBe('based_on_ip')
  })

  it('lets a negation win over a bare YouTube mention', () => {
    // "not for youtube" contains "for youtube" — the negative branch must win,
    // or the user would get the opposite of what they asked for.
    const on = rowToSimpleDraft({ ...baseRow, google_optimized: true } as ProfileRow)
    const r = parseAsk('make it generic, not for youtube', ctx({ draft: on }))
    expect(r.patch.google_optimized).toBe(false)
    expect(r.changes).toContain('Optimized for YouTube → off')
  })

  it('assigns a group by name', () => {
    const r = parseAsk('put it in Crime Dynasty', ctx())
    expect(r.patch.group_id).toBe('g1')
    expect(r.changes).toContain('Group → Crime Dynasty')
  })

  it('adds known tags without duplicating existing ones', () => {
    const withTag = rowToSimpleDraft({ ...baseRow, tags: ['flagship'] } as ProfileRow)
    expect(parseAsk('tag it flagship', ctx({ draft: withTag })).changes).toEqual([])
    const r = parseAsk('tag it flagship and warm', ctx())
    expect(r.patch.tags).toEqual(['flagship', 'warm'])
  })

  it('renames on explicit instruction only', () => {
    expect(parseAsk('call it Night Shift', ctx()).patch.name).toBe('Night Shift')
    // A bare mention must not rename.
    expect(parseAsk('Night Shift', ctx()).patch.name).toBeUndefined()
  })

  it('combines several instructions in one request', () => {
    const r = parseAsk('Make it a mac profile on the Dallas IP, tag it flagship', ctx())
    expect(r.patch.platform).toBe('macos')
    expect(r.proxy?.id).toBe('px1')
    expect(r.patch.tags).toEqual(['flagship'])
    expect(r.changes).toHaveLength(3)
  })

  // Reported by the client: "Make it a mac profile on the Dallas IP" answered
  // "Nothing to change — try naming a device, proxy, group or tag" on a profile
  // that was ALREADY macOS and whose workspace had no Dallas proxy. The parse
  // was correct; the reporting made a no-op look like a failure to understand.
  describe('distinguishes already-satisfied from not-understood', () => {
    it('reports an already-correct device instead of staying silent', () => {
      const onMac = rowToSimpleDraft({ ...baseRow, platform: 'macos' } as ProfileRow)
      const r = parseAsk('make it a mac profile', ctx({ draft: onMac }))
      expect(r.changes).toEqual([])
      expect(r.alreadySet).toContain('Device is already macOS')
      expect(r.unmatched).toEqual([])
    })

    it('reports a location that matches no proxy in the workspace', () => {
      // PROXIES are Dallas + Miami; nothing in Denver.
      const r = parseAsk('put it on the Denver IP', ctx())
      expect(r.changes).toEqual([])
      expect(r.unmatched).toContain('Denver')
    })

    it('reports an already-assigned proxy rather than reassigning it', () => {
      const r = parseAsk('use the Dallas IP', ctx({ currentProxyHost: '38.84.26.198' }))
      expect(r.proxy).toBeUndefined()
      expect(r.changes).toEqual([])
      expect(r.alreadySet.some((m) => m.includes('already'))).toBe(true)
    })

    it('still flags the unmatched half of a partly-understood request', () => {
      // Device changes; "Denver" matches nothing. Both must be reported.
      const r = parseAsk('make it a mac profile on the Denver IP', ctx())
      expect(r.patch.platform).toBe('macos')
      expect(r.unmatched).toContain('Denver')
    })

    it('leaves genuinely unparseable input with neither signal', () => {
      const r = parseAsk('hello there', ctx())
      expect(r.changes).toEqual([])
      expect(r.alreadySet).toEqual([])
      expect(r.unmatched).toEqual([])
    })

    it('does not mistake a group name for an unmatched location', () => {
      const r = parseAsk('put it in Crime Dynasty', ctx())
      expect(r.patch.group_id).toBe('g1')
      expect(r.unmatched).toEqual([])
    })
  })

  describe('assigning an unused proxy', () => {
    it('prefers a proxy no profile is on', () => {
      // px2 (Miami) is the only free one — the bare "assign a proxy" must not
      // hand out px1 just because it sorts first in the general pool.
      const r = parseAsk('assign a proxy', ctx({ unusedProxies: [PROXIES[1]] }))
      expect(r.proxy?.id).toBe('px2')
      expect(r.changes[0]).toContain('unused')
    })

    it('answers to "unused"/"free"/"fresh proxy" phrasing', () => {
      for (const q of ['give me an unused proxy', 'use a free proxy', 'fresh proxy please']) {
        expect(parseAsk(q, ctx({ unusedProxies: [PROXIES[1]] })).proxy?.id).toBe('px2')
      }
    })

    it('falls back to a shared proxy when the pool is exhausted, and says so', () => {
      const r = parseAsk('assign a proxy', ctx({ unusedProxies: [] }))
      expect(r.proxy?.id).toBe('px1')
      expect(r.changes[0]).toContain('all in use')
    })

    it('reports an empty workspace rather than silently doing nothing', () => {
      const r = parseAsk('assign a proxy', ctx({ proxies: [], unusedProxies: [] }))
      expect(r.proxy).toBeUndefined()
      expect(r.alreadySet).toContain('No proxies in this workspace')
    })

    it('still honours an explicitly named proxy over the unused shortcut', () => {
      const r = parseAsk('use the Dallas IP', ctx({ unusedProxies: [PROXIES[1]] }))
      expect(r.proxy?.id).toBe('px1')
    })
  })
})
