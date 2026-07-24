// Cookie-file normalization for the Profiles Import menu. Accepts the two
// wild formats (JSON cookie-exporter arrays and Netscape cookies.txt) and
// normalizes both through the canonical shared parser, so what we store in
// profiles.cookies_json is exactly what the launch path injects via CDP.

import { inspectCookiesJson } from '../../../../shared/cookies'

// Netscape cookies.txt line: domain \t includeSubdomains \t path \t secure \t
// expiry \t name \t value. curl/yt-dlp prefix HttpOnly cookies with
// "#HttpOnly_" — those are real cookies, not comments.
export function parseNetscapeCookies(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line) continue
    let httpOnly = false
    if (line.startsWith('#HttpOnly_')) {
      httpOnly = true
      line = line.slice('#HttpOnly_'.length)
    } else if (line.startsWith('#')) {
      continue
    }
    const parts = line.split('\t')
    if (parts.length < 7) continue
    const [domain, , path, secure, expires] = parts
    const name = parts[5]
    const value = parts.slice(6).join('\t')
    const exp = Number(expires)
    out.push({
      domain,
      path: path || '/',
      secure: secure.toUpperCase() === 'TRUE',
      httpOnly,
      name,
      value,
      ...(Number.isFinite(exp) && exp > 0 ? { expirationDate: exp } : { session: true })
    })
  }
  return out
}

export interface NormalizedCookies {
  json: string // normalized exporter JSON for profiles.cookies_json
  count: number
  skipped: number
}

// Detect + parse a cookie file (JSON or Netscape), returning the normalized
// JSON to persist. Throws with a user-readable message when nothing usable
// is found.
export function normalizeCookieFile(text: string): NormalizedCookies {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('The file is empty')

  const tryInspect = (json: string): NormalizedCookies | null => {
    const insp = inspectCookiesJson(json)
    if (!insp.ok || insp.total === 0) return null
    return { json: JSON.stringify(insp.cookies), count: insp.total, skipped: insp.skipped.length }
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const r = tryInspect(trimmed)
    if (r) return r
    throw new Error('No valid cookies found in the JSON file')
  }

  const netscape = parseNetscapeCookies(trimmed)
  if (netscape.length > 0) {
    const r = tryInspect(JSON.stringify(netscape))
    if (r) return r
  }
  throw new Error('Unrecognized cookie file — expected a JSON export or Netscape cookies.txt')
}

// Vendor exports embed cookies as an array or as a JSON-encoded string.
// Returns normalized JSON or null (never throws — cookies are best-effort
// on profile migration).
export function normalizeEmbeddedCookies(raw: unknown): string | null {
  try {
    let candidate: unknown = raw
    if (typeof candidate === 'string') {
      const s = candidate.trim()
      if (!s) return null
      candidate = JSON.parse(s)
    }
    if (!Array.isArray(candidate) || candidate.length === 0) return null
    const insp = inspectCookiesJson(JSON.stringify(candidate))
    if (!insp.ok || insp.total === 0) return null
    return JSON.stringify(insp.cookies)
  } catch {
    return null
  }
}
