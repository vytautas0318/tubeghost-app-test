// Cover for spreadsheet import. The AdsPower / generic-CSV menu entries offered
// .xlsx in the file picker while the parser rejected it outright ("Excel files
// aren't supported directly"), so picking the file the picker suggested was a
// dead end. These tests run against a REAL zipped workbook fixture.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseXlsxGrid, xlsxToObjects } from '@/lib/importers/xlsx'
import { profilesFromRecords } from '@/lib/importers/foreign'

const here = dirname(fileURLToPath(import.meta.url))
const buf = (): ArrayBuffer => {
  const b = readFileSync(join(here, 'fixtures', 'adspower-sample.xlsx'))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('parseXlsxGrid', () => {
  it('reads the first worksheet, resolving shared strings and numbers', () => {
    const grid = parseXlsxGrid(buf())
    expect(grid[0]).toEqual(['Name', 'Group', 'Proxy Host', 'Proxy Port', 'Proxy Type', 'Remark'])
    expect(grid[1]).toEqual(['YT Main', 'Clients', '1.2.3.4', '8080', 'socks5', 'first & best'])
  })

  it('keeps columns aligned when a row omits empty cells', () => {
    // Row 3 only has A3 and D3 — the sheet skips B/C entirely, so position must
    // come from the cell reference, not from the order cells appear in.
    const grid = parseXlsxGrid(buf())
    expect(grid[2][0]).toBe('YT Alt')
    expect(grid[2][1]).toBe('')
    expect(grid[2][3]).toBe('0')
  })

  it('rejects a legacy .xls with an actionable message', () => {
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])
    expect(() => parseXlsxGrid(xls.buffer as ArrayBuffer)).toThrow(/re-save as \.xlsx or CSV/)
  })

  it('rejects a non-workbook file', () => {
    const junk = new TextEncoder().encode('just some text')
    expect(() => parseXlsxGrid(junk.buffer as ArrayBuffer)).toThrow(/readable \.xlsx/)
  })
})

describe('xlsx → profiles', () => {
  it('maps sheet columns through the same field mapping as CSV', () => {
    const profiles = profilesFromRecords(xlsxToObjects(buf()), 'adspower-sample')
    expect(profiles).toHaveLength(2)

    expect(profiles[0].name).toBe('YT Main')
    expect(profiles[0].group).toBe('Clients')
    expect(profiles[0].notes).toBe('first & best')
    expect(profiles[0].proxy).toEqual({
      type: 'socks5',
      host: '1.2.3.4',
      port: 8080,
      user: null,
      pass: null
    })

    // Sparse row: name only, no proxy — must still import, not throw.
    expect(profiles[1].name).toBe('YT Alt')
    expect(profiles[1].proxy).toBeNull()
    expect(profiles[1].group).toBeNull()
  })
})
