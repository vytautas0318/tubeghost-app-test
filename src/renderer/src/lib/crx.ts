// Browser-side .crx / .zip parsing — the web port of the desktop app's
// main-process extension store.
//
// The desktop build unzipped to <userData>/extensions/<id>/ so chromium could
// --load-extension it. The web app has no filesystem, so we unzip in memory
// with fflate (already a dep — see lib/importers/xlsx.ts) and read the
// manifest, locale messages, and icon straight out of the entry map.
//
// .crx format: an optional signed header precedes a standard ZIP. CRX2 and
// CRX3 differ, so rather than parse the header we locate the ZIP payload by
// its local-file-header magic (PK\x03\x04) and unzip from there. A plain .zip
// (unpacked extension zipped up) has the magic at offset 0 → same path.

import { unzipSync, strFromU8 } from 'fflate'
import type { PermissionScope } from './extensions'
import {
  derivePermissionScope,
  deriveCategory,
  derivePublisher,
  deriveOptionsPage,
  largestIconPath,
  type ParsedManifest
} from './ext-manifest'

// Derived metadata the caller persists to the Supabase `extensions` row.
export interface ParsedExtension {
  name: string
  version: string
  publisher: string
  description: string | null
  category: string
  permissionScope: PermissionScope
  iconDataUrl: string | null
  optionsPage: string | null
  manifest: ParsedManifest
}

export class ExtensionParseError extends Error {
  constructor(
    public readonly code: 'not-zip' | 'no-manifest' | 'bad-manifest' | 'extract',
    message: string
  ) {
    super(message)
    this.name = 'ExtensionParseError'
  }
}

type ZipEntries = Record<string, Uint8Array>

// A 32-char a–p extension id, as it appears in a CWS URL:
//   https://chromewebstore.google.com/detail/<slug>/<ID>
const ID_RE = /[a-p]{32}/

// Accept a bare id, a full CWS URL, or a paste containing one. Returns the
// 32-char id or null.
export function extractWebStoreId(input: string): string | null {
  const m = input.trim().match(ID_RE)
  return m ? m[0] : null
}

function isZipStart(buf: Uint8Array, i: number): boolean {
  return buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04
}

// Return a view starting at the ZIP payload, stripping any CRX header.
// (Node's Buffer.indexOf isn't available in the browser, so we scan.)
function stripCrxHeader(buf: Uint8Array): Uint8Array {
  if (buf.length >= 4 && isZipStart(buf, 0)) return buf // plain zip
  const limit = buf.length - 4
  for (let i = 0; i <= limit; i++) {
    if (isZipStart(buf, i)) return buf.subarray(i)
  }
  throw new ExtensionParseError('not-zip', 'File is not a .crx or .zip (no ZIP payload found).')
}

// Localized manifests reference message tokens ("__MSG_extName__"). Resolve
// name/description against the default-locale messages.json so the card shows
// a real name instead of the raw placeholder. Best-effort — on any miss the
// original (placeholder) string is kept.
function resolveI18nFields(files: ZipEntries, m: ParsedManifest): void {
  const needs = (s: unknown): s is string => typeof s === 'string' && /^__MSG_.+__$/.test(s)
  if (!needs(m.name) && !needs(m.description)) return
  const locale = typeof m.default_locale === 'string' ? m.default_locale : 'en'
  const raw = files[`_locales/${locale}/messages.json`]
  if (!raw) return
  let messages: Record<string, { message?: string }>
  try {
    messages = JSON.parse(strFromU8(raw).replace(/^\uFEFF/, ''))
  } catch {
    return
  }
  const resolve = (s: string): string => messages[s.slice(6, -2)]?.message ?? s
  if (needs(m.name)) m.name = resolve(m.name)
  if (needs(m.description)) m.description = resolve(m.description)
}

function readManifest(files: ZipEntries): ParsedManifest {
  const raw = files['manifest.json']
  if (!raw) {
    throw new ExtensionParseError(
      'no-manifest',
      'Archive has no manifest.json — not a valid extension.'
    )
  }
  let parsed: unknown
  try {
    // Strip a UTF-8 BOM some editors leave, which JSON.parse rejects.
    parsed = JSON.parse(strFromU8(raw).replace(/^\uFEFF/, ''))
  } catch (e) {
    throw new ExtensionParseError(
      'bad-manifest',
      `manifest.json is not valid JSON: ${(e as Error).message}`
    )
  }
  const m = parsed as ParsedManifest
  if (!m || typeof m !== 'object' || typeof m.name !== 'string' || !m.name.trim()) {
    throw new ExtensionParseError('bad-manifest', 'manifest.json is missing a "name".')
  }
  resolveI18nFields(files, m)
  return m
}

// btoa() needs a binary string. Build it in chunks — spreading a whole icon
// into String.fromCharCode overflows the call stack on larger files.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

// Read the manifest's largest icon and embed it as a data URL for the card.
// Best-effort — a missing/unreadable icon just yields null (letter-tile
// fallback in the UI). Capped so a giant icon can't bloat the Supabase row.
function readIconDataUrl(files: ZipEntries, m: ParsedManifest): string | null {
  const rel = largestIconPath(m)
  if (!rel) return null
  const path = rel.replace(/^\/+/, '')
  const bytes = files[path]
  if (!bytes || bytes.byteLength > 256 * 1024) return null
  const dot = path.lastIndexOf('.')
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : ''
  const mime =
    ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.svg'
        ? 'image/svg+xml'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png'
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

// Parse raw .crx/.zip bytes → derived metadata. Throws ExtensionParseError
// with a user-facing message on any malformed input.
export function parseExtensionArchive(bytes: Uint8Array): ParsedExtension {
  const payload = stripCrxHeader(bytes)
  let files: ZipEntries
  try {
    files = unzipSync(payload)
  } catch (e) {
    throw new ExtensionParseError(
      'extract',
      `Could not unzip the extension: ${(e as Error).message}`
    )
  }
  const m = readManifest(files)
  return {
    name: (m.name as string).trim(),
    version: typeof m.version === 'string' ? m.version : '0.0.0',
    publisher: derivePublisher(m),
    description: typeof m.description === 'string' ? m.description : null,
    category: deriveCategory(m),
    permissionScope: derivePermissionScope(m),
    iconDataUrl: readIconDataUrl(files, m),
    optionsPage: deriveOptionsPage(m),
    manifest: m
  }
}
