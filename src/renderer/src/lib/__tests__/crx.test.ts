// Cover for the browser-side .crx parser. The desktop build unzipped to disk
// with extract-zip and read files with node:fs; the web port does it in memory
// with fflate, so the header-stripping, locale resolution, and icon base64
// paths are all new code and worth pinning down.
//
// Fixtures are built in-test with fflate rather than committed binaries —
// a .crx is just a signed header plus a ZIP, so we can synthesize both.

import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { parseExtensionArchive, extractWebStoreId, ExtensionParseError } from '@/lib/crx'

type Entries = Record<string, Uint8Array>

const zip = (files: Record<string, string | Uint8Array>): Uint8Array => {
  const entries: Entries = {}
  for (const [k, v] of Object.entries(files)) {
    entries[k] = typeof v === 'string' ? strToU8(v) : v
  }
  return zipSync(entries)
}

// A CRX3 container: "Cr24" magic, format version 3, a header length, then
// `headerLen` bytes of protobuf signature data, then the ZIP payload. The
// filler deliberately avoids the PK\x03\x04 sequence the parser scans for.
const wrapCrx3 = (payload: Uint8Array, headerLen = 24): Uint8Array => {
  const out = new Uint8Array(12 + headerLen + payload.length)
  out.set([0x43, 0x72, 0x32, 0x34], 0) // "Cr24"
  out.set([3, 0, 0, 0], 4) // version 3, little-endian
  out.set([headerLen & 0xff, 0, 0, 0], 8)
  out.fill(0xab, 12, 12 + headerLen)
  out.set(payload, 12 + headerLen)
  return out
}

const MANIFEST = {
  manifest_version: 3,
  name: 'Test Extension',
  version: '2.1.0',
  description: 'A test fixture',
  author: 'TubeGhost',
  permissions: ['storage'],
  host_permissions: ['*://*.youtube.com/*']
}

const basicZip = (): Uint8Array => zip({ 'manifest.json': JSON.stringify(MANIFEST) })

describe('parseExtensionArchive', () => {
  it('parses a plain .zip (magic at offset 0)', () => {
    const ext = parseExtensionArchive(basicZip())
    expect(ext.name).toBe('Test Extension')
    expect(ext.version).toBe('2.1.0')
    expect(ext.publisher).toBe('TubeGhost')
    expect(ext.description).toBe('A test fixture')
  })

  it('strips a CRX3 header and parses the ZIP payload', () => {
    const ext = parseExtensionArchive(wrapCrx3(basicZip()))
    expect(ext.name).toBe('Test Extension')
    expect(ext.version).toBe('2.1.0')
  })

  it('derives scoped host access as limited, <all_urls> as broad', () => {
    expect(parseExtensionArchive(basicZip()).permissionScope).toBe('limited')

    const broad = zip({
      'manifest.json': JSON.stringify({ ...MANIFEST, host_permissions: ['<all_urls>'] })
    })
    expect(parseExtensionArchive(broad).permissionScope).toBe('broad')
  })

  it('treats a high-risk API permission as broad even without host access', () => {
    const risky = zip({
      'manifest.json': JSON.stringify({
        name: 'Cookie Reader',
        version: '1.0',
        permissions: ['cookies']
      })
    })
    expect(parseExtensionArchive(risky).permissionScope).toBe('broad')
  })

  it('resolves __MSG_ tokens against the default locale', () => {
    const localized = zip({
      'manifest.json': JSON.stringify({
        name: '__MSG_extName__',
        description: '__MSG_extDesc__',
        version: '1.0',
        default_locale: 'de'
      }),
      '_locales/de/messages.json': JSON.stringify({
        extName: { message: 'Echter Name' },
        extDesc: { message: 'Echte Beschreibung' }
      })
    })
    const ext = parseExtensionArchive(localized)
    expect(ext.name).toBe('Echter Name')
    expect(ext.description).toBe('Echte Beschreibung')
  })

  it('keeps the placeholder when the locale file is missing', () => {
    const orphan = zip({
      'manifest.json': JSON.stringify({ name: '__MSG_extName__', version: '1.0' })
    })
    expect(parseExtensionArchive(orphan).name).toBe('__MSG_extName__')
  })

  it('embeds the largest declared icon as a data URL', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00])
    const withIcon = zip({
      'manifest.json': JSON.stringify({
        ...MANIFEST,
        icons: { '16': 'small.png', '128': 'img/big.png' }
      }),
      'img/big.png': png,
      'small.png': new Uint8Array([0x00])
    })
    const ext = parseExtensionArchive(withIcon)
    // Picks 128 over 16, and round-trips the bytes through base64.
    expect(ext.iconDataUrl).toBe(`data:image/png;base64,${Buffer.from(png).toString('base64')}`)
  })

  it('survives an icon larger than the embed cap by returning null', () => {
    const huge = new Uint8Array(300 * 1024)
    const withHuge = zip({
      'manifest.json': JSON.stringify({ ...MANIFEST, icons: { '128': 'big.png' } }),
      'big.png': huge
    })
    expect(parseExtensionArchive(withHuge).iconDataUrl).toBeNull()
  })

  it('rejects bytes with no ZIP payload', () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(() => parseExtensionArchive(junk)).toThrow(ExtensionParseError)
    expect(() => parseExtensionArchive(junk)).toThrow(/not a \.crx or \.zip/)
  })

  it('rejects an archive with no manifest.json', () => {
    expect(() => parseExtensionArchive(zip({ 'readme.txt': 'hi' }))).toThrow(/no manifest\.json/)
  })

  it('rejects a manifest that is not valid JSON', () => {
    expect(() => parseExtensionArchive(zip({ 'manifest.json': '{ nope' }))).toThrow(
      /not valid JSON/
    )
  })

  it('rejects a manifest with no name', () => {
    expect(() => parseExtensionArchive(zip({ 'manifest.json': '{"version":"1.0"}' }))).toThrow(
      /missing a "name"/
    )
  })
})

describe('extractWebStoreId', () => {
  it('accepts a bare id', () => {
    expect(extractWebStoreId('pachckjkecffpdphbpmfolblodfkgbhl')).toBe(
      'pachckjkecffpdphbpmfolblodfkgbhl'
    )
  })

  it('pulls the id out of a full Web Store URL', () => {
    const url =
      'https://chromewebstore.google.com/detail/vidiq/pachckjkecffpdphbpmfolblodfkgbhl?hl=en'
    expect(extractWebStoreId(url)).toBe('pachckjkecffpdphbpmfolblodfkgbhl')
  })

  it('returns null for input with no id', () => {
    expect(extractWebStoreId('not an extension')).toBeNull()
    expect(extractWebStoreId('')).toBeNull()
  })
})
