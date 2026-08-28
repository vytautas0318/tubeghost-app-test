// Round-trip tests for bulk profile export.
//
// The bulk Export action writes ONE file containing many profiles. The risk is
// a file that exports fine but can't be imported back, so these pin the
// envelope shape and both import directions.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ProfileRow } from '@/lib/profiles'

const rows = new Map<string, ProfileRow>()
const inserted: Record<string, unknown>[] = []

const single = vi.fn(async () => {
  const row = inserted[inserted.length - 1]
  return { data: { ...row, id: `new-${inserted.length}` }, error: null }
})

// getProfile() reads .from('browser_profiles').select('*').eq('id', id)
// .maybeSingle() — serve it from the fixture map so export has real rows.
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({ data: rows.get(id) ?? null, error: null })
        })
      }),
      insert: (v: Record<string, unknown>) => {
        inserted.push(v)
        return { select: () => ({ single }) }
      }
    })
  })
}))

const profiles = await import('../profiles')

const mk = (id: string, name: string): ProfileRow =>
  ({
    id,
    workspace_id: 'ws1',
    name,
    fingerprint_seed: 42,
    platform: 'windows',
    proxy_host: '1.2.3.4',
    proxy_port: 8080,
    proxy_pass: 'SECRET',
    // Lock/audit fields that must never leave the machine.
    profile_number: 7,
    last_opened_at: '2026-08-01T00:00:00Z',
    open_session_id: 'sess',
    tubeproxies_ip_id: 'ip-1'
  }) as unknown as ProfileRow

beforeEach(() => {
  rows.clear()
  inserted.length = 0
  rows.set('p1', mk('p1', 'Profile 1'))
  rows.set('p2', mk('p2', 'Profile 2'))
})

describe('exportProfiles', () => {
  it('emits every selected profile in one bundle', async () => {
    const bundle = JSON.parse(await profiles.exportProfiles(['p1', 'p2']))
    expect(bundle._format).toBe('tubeproxies-profile')
    expect(bundle.profiles).toHaveLength(2)
    expect(bundle.profiles.map((p: { name: string }) => p.name)).toEqual(['Profile 1', 'Profile 2'])
  })

  it('strips secrets and machine-local identifiers from every entry', async () => {
    const bundle = JSON.parse(await profiles.exportProfiles(['p1', 'p2']))
    for (const p of bundle.profiles) {
      // A bundle is a file that leaves the machine.
      expect(p.proxy_pass).toBeUndefined()
      expect(p.id).toBeUndefined()
      expect(p.workspace_id).toBeUndefined()
      expect(p.profile_number).toBeUndefined()
      expect(p.open_session_id).toBeUndefined()
      expect(p.tubeproxies_ip_id).toBeUndefined()
      // Config the copy needs must survive.
      expect(p.name).toBeTruthy()
      expect(p.platform).toBe('windows')
    }
  })

  it('keeps proxy_pass only when secrets are explicitly opted in', async () => {
    const bundle = JSON.parse(await profiles.exportProfiles(['p1'], { includeSecrets: true }))
    expect(bundle.profiles[0].proxy_pass).toBe('SECRET')
  })

  it('skips ids that no longer resolve rather than emitting null entries', async () => {
    const bundle = JSON.parse(await profiles.exportProfiles(['p1', 'gone']))
    expect(bundle.profiles).toHaveLength(1)
  })

  it('refuses an empty export', async () => {
    await expect(profiles.exportProfiles(['gone'])).rejects.toThrow(/No profiles/)
  })
})

describe('import round-trip', () => {
  it('importProfilesBundle restores every profile from a bundle', async () => {
    const json = await profiles.exportProfiles(['p1', 'p2'])
    const r = await profiles.importProfilesBundle(json, 'ws2')
    expect(r).toMatchObject({ created: 2, failed: 0 })
    // Imported into the TARGET workspace, not the source one.
    expect(inserted.every((i) => i.workspace_id === 'ws2')).toBe(true)
    expect(inserted.map((i) => i.name)).toEqual(['Profile 1', 'Profile 2'])
  })

  it('importProfile still accepts a bundle (reads the first entry)', async () => {
    // Back-compat: the single-file import path must not break on a bundle.
    const json = await profiles.exportProfiles(['p1'])
    const row = await profiles.importProfile(json, 'ws2')
    expect(row).toBeTruthy()
    expect(inserted[0].name).toBe('Profile 1')
  })

  it('importProfilesBundle still accepts a legacy single-profile file', async () => {
    const json = await profiles.exportProfile('p1')
    const r = await profiles.importProfilesBundle(json, 'ws2')
    expect(r).toMatchObject({ created: 1, failed: 0 })
  })

  it('rejects a file that is not a TubeGhost export', async () => {
    await expect(profiles.importProfilesBundle('{"hello":1}', 'ws2')).rejects.toThrow(
      /Not a TubeProxies profile export/
    )
  })
})
