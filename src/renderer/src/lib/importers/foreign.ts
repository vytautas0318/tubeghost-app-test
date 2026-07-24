// Foreign-browser profile parsing (MultiLogin / AdsPower / GoLogin /
// Dolphin{anty} / Incogniton / generic CSV). Every vendor export reduces to
// the same ParsedProfile: name + proxy + cookies + notes/tags/platform.
//
// Deliberate scope: we import the user's ASSETS (name, proxy, cookies, notes,
// tags, target OS) but NOT the foreign fingerprint (UA/GPU/canvas params) —
// profiles get a fresh coherent TubeGhost fingerprint for the chosen platform,
// which is strictly better than replaying another vendor's spoof values.

import { csvToObjects } from './csv'
import { normalizeEmbeddedCookies } from './cookies'

export type ImportVendor = 'multilogin' | 'adspower' | 'gologin' | 'dolphin' | 'incogniton' | 'csv'

export interface ParsedProxy {
  type: string // http | https | socks5 | socks4
  host: string
  port: number
  user?: string | null
  pass?: string | null
}

export interface ParsedProfile {
  name: string
  platform?: string | null // windows | macos | linux
  notes?: string | null
  tags?: string[]
  proxy?: ParsedProxy | null
  cookiesJson?: string | null
}

type Rec = Record<string, unknown>

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null

const pick = (o: Rec, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]
  return null
}

export function normalizePlatform(v: unknown): string | null {
  const s = (str(v) ?? '').toLowerCase()
  if (!s) return null
  if (/win/.test(s)) return 'windows'
  if (/mac|osx|os x|darwin/.test(s)) return 'macos'
  if (/lin|ubuntu/.test(s)) return 'linux'
  return null
}

function normalizeProxyType(v: unknown): string {
  const s = (str(v) ?? '').toLowerCase()
  if (s.includes('socks5')) return 'socks5'
  if (s.includes('socks4')) return 'socks4'
  if (s.includes('https')) return 'https'
  return 'http'
}

// "http://user:pass@host:port", "user:pass@host:port", "host:port:user:pass",
// "host:port" — the common one-string proxy spellings.
export function parseProxyString(raw: string): ParsedProxy | null {
  let s = raw.trim()
  if (!s || /^(none|no ?proxy|direct)$/i.test(s)) return null
  let type = 'http'
  const scheme = s.match(/^(https?|socks[45]?):\/\//i)
  if (scheme) {
    type = normalizeProxyType(scheme[1])
    s = s.slice(scheme[0].length)
  }
  let user: string | null = null
  let pass: string | null = null
  const at = s.lastIndexOf('@')
  if (at !== -1) {
    const cred = s.slice(0, at)
    s = s.slice(at + 1)
    const colon = cred.indexOf(':')
    user = colon === -1 ? cred : cred.slice(0, colon)
    pass = colon === -1 ? null : cred.slice(colon + 1)
  }
  const parts = s.split(':')
  if (parts.length >= 2) {
    const port = Number(parts[1])
    if (!parts[0] || !Number.isFinite(port)) return null
    if (parts.length >= 4 && !user) {
      user = parts[2]
      pass = parts.slice(3).join(':')
    }
    return { type, host: parts[0], port, user, pass }
  }
  return null
}

function parseProxyValue(v: unknown): ParsedProxy | null {
  if (v == null) return null
  if (typeof v === 'string') return parseProxyString(v)
  if (typeof v !== 'object') return null
  const p = v as Rec
  const mode = (
    str(pick(p, 'mode', 'type', 'protocol', 'proxy_type', 'proxyType')) ?? ''
  ).toLowerCase()
  if (/^(none|no ?proxy|direct|off)$/.test(mode)) return null
  const host = str(pick(p, 'host', 'ip', 'address', 'proxy_host', 'hostname'))
  const port = Number(pick(p, 'port', 'proxy_port'))
  if (!host || !Number.isFinite(port) || port <= 0) return null
  return {
    type: normalizeProxyType(mode),
    host,
    port,
    user: str(pick(p, 'username', 'user', 'login', 'proxy_user')),
    pass: str(pick(p, 'password', 'pass', 'proxy_password'))
  }
}

function parseTags(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const tags = v.map((t) => str(t)).filter((t): t is string => !!t)
    return tags.length ? tags : undefined
  }
  const s = str(v)
  if (!s) return undefined
  const tags = s
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean)
  return tags.length ? tags : undefined
}

// One vendor JSON record → ParsedProfile. Tolerant across ML/GoLogin/Dolphin
// field spellings; unknown keys are ignored.
function mapJsonRecord(o: Rec, fallbackName: string): ParsedProfile {
  const proxy =
    parseProxyValue(pick(o, 'proxy', 'proxyConfig', 'proxy_config')) ??
    parseProxyValue((pick(o, 'network') as Rec | null)?.['proxy']) ??
    parseProxyValue(pick(o, 'proxyString', 'proxy_str'))
  return {
    name: str(pick(o, 'name', 'profileName', 'profile_name', 'title')) ?? fallbackName,
    platform: normalizePlatform(
      pick(o, 'os', 'platform', 'osName', 'operating_system') ??
        (pick(o, 'fingerprint') as Rec | null)?.['os']
    ),
    notes: str(pick(o, 'notes', 'note', 'remark', 'description', 'comment')),
    tags: parseTags(pick(o, 'tags', 'tag', 'labels')),
    proxy,
    cookiesJson: normalizeEmbeddedCookies(pick(o, 'cookies', 'cookie'))
  }
}

// One CSV row (normalized headers, see csv.ts) → ParsedProfile.
function mapCsvRow(o: Record<string, string>, fallbackName: string): ParsedProfile {
  const r = o as Rec
  let proxy: ParsedProxy | null = null
  const host = str(pick(r, 'proxyhost', 'proxyip', 'proxyaddress', 'ip', 'host'))
  const port = Number(pick(r, 'proxyport', 'port'))
  if (host && Number.isFinite(port) && port > 0) {
    proxy = {
      type: normalizeProxyType(pick(r, 'proxytype', 'proxyprotocol')),
      host,
      port,
      user: str(pick(r, 'proxyuser', 'proxyusername', 'proxylogin')),
      pass: str(pick(r, 'proxypassword', 'proxypass'))
    }
  } else {
    const one = str(pick(r, 'proxy', 'proxystring'))
    if (one) proxy = parseProxyString(one)
  }
  return {
    name: str(pick(r, 'name', 'profilename', 'profile', 'title')) ?? fallbackName,
    platform: normalizePlatform(pick(r, 'os', 'platform', 'system')),
    notes: str(pick(r, 'remark', 'notes', 'note', 'description')),
    tags: parseTags(pick(r, 'tags', 'tag')),
    proxy,
    cookiesJson: normalizeEmbeddedCookies(pick(r, 'cookie', 'cookies'))
  }
}

// Entry point. Throws with a user-readable message on unusable files.
export function parseForeignProfiles(fileName: string, text: string): ParsedProfile[] {
  if (/\.xlsx?$/i.test(fileName) || text.startsWith('PK')) {
    throw new Error('Excel files aren’t supported directly — save/export as CSV first')
  }
  const base = fileName.replace(/\.[^.]+$/, '') || 'Imported profile'
  const trimmed = text.trim()
  if (!trimmed) throw new Error('The file is empty')

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let root: unknown
    try {
      root = JSON.parse(trimmed)
    } catch {
      throw new Error('Invalid JSON')
    }
    const arr: unknown[] = Array.isArray(root)
      ? root
      : ((['profiles', 'data', 'items', 'list'].map((k) => (root as Rec)[k]).find(Array.isArray) as
          | unknown[]
          | undefined) ?? [root])
    const out = arr
      .filter((x): x is Rec => !!x && typeof x === 'object')
      .map((x, i) => mapJsonRecord(x, arr.length > 1 ? `${base} ${i + 1}` : base))
    if (out.length === 0) throw new Error('No profiles found in the file')
    return out
  }

  const rows = csvToObjects(text)
  const out = rows.map((r, i) => mapCsvRow(r, `${base} ${i + 1}`))
  if (out.length === 0) throw new Error('No rows found — is the CSV missing a header line?')
  return out
}
