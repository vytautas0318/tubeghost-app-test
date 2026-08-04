// Regression cover for the export → import round trip.
//
// The bug: a TubeGhost export (`{_format:'tubeproxies-profile', profile:{…}}`)
// imported through the CSV / vendor menu entry fell into the generic JSON path,
// which mapped the ENVELOPE instead of `.profile`. The envelope has no `name`
// or `proxy`, so the importer named the profile after the FILE
// ("Test.tubeproxies-profile (1)") and dropped the proxy.

import { describe, expect, it } from 'vitest'
import { isTubeGhostExport, parseForeignProfiles } from '@/lib/importers/foreign'

const EXPORT_ENVELOPE = JSON.stringify({
  _format: 'tubeproxies-profile',
  _version: 1,
  profile: {
    name: 'Test',
    platform: 'windows',
    notes: 'hello',
    tags: ['a', 'b'],
    proxy_type: 'http',
    proxy_host: '63.246.158.234',
    proxy_port: 6482,
    proxy_user: 'u'
  }
})

describe('isTubeGhostExport', () => {
  it('recognises our own export envelope', () => {
    expect(isTubeGhostExport(EXPORT_ENVELOPE)).toBe(true)
  })

  it('rejects foreign JSON, CSV text and garbage', () => {
    expect(isTubeGhostExport('{"profiles":[{"name":"x"}]}')).toBe(false)
    expect(isTubeGhostExport('name,proxy\nA,1.2.3.4:8080')).toBe(false)
    expect(isTubeGhostExport('not json at all')).toBe(false)
    // Right marker, missing payload → not usable as an export.
    expect(isTubeGhostExport('{"_format":"tubeproxies-profile"}')).toBe(false)
  })
})

describe('parseForeignProfiles', () => {
  it('unwraps a single-object {profile:…} wrapper instead of mapping the wrapper', () => {
    // Even via the foreign path (the fallback), the name must come from the
    // payload — never from the file name.
    const out = parseForeignProfiles('Test.tubeproxies-profile (1).json', EXPORT_ENVELOPE)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Test')
    expect(out[0].name).not.toContain('tubeproxies-profile')
    expect(out[0].proxy).toEqual({
      type: 'http',
      host: '63.246.158.234',
      port: 6482,
      user: 'u',
      pass: null
    })
    expect(out[0].platform).toBe('windows')
    expect(out[0].tags).toEqual(['a', 'b'])
  })

  it('still names a record after the file when the payload has no name', () => {
    const out = parseForeignProfiles('my-export.json', JSON.stringify({ proxy: '1.2.3.4:8080' }))
    expect(out[0].name).toBe('my-export')
  })

  it('maps a plain CSV with headers', () => {
    const csv = 'Name,Proxy Host,Proxy Port,Tags\nAlpha,1.2.3.4,8080,"x;y"'
    const out = parseForeignProfiles('list.csv', csv)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Alpha')
    expect(out[0].proxy?.host).toBe('1.2.3.4')
    expect(out[0].proxy?.port).toBe(8080)
    expect(out[0].tags).toEqual(['x', 'y'])
  })

  it('keeps mapping vendor arrays as before', () => {
    const json = JSON.stringify({ profiles: [{ name: 'One' }, { name: 'Two' }] })
    const out = parseForeignProfiles('vendor.json', json)
    expect(out.map((p) => p.name)).toEqual(['One', 'Two'])
  })
})
