// Canonical cookie parsing for TubeProxies — shared by BOTH the renderer's
// import UI (validation + auth-cookie report) and the main-process launch
// injection, so what the UI says was imported is exactly what gets injected.
//
// Input: a standard cookie-exporter array (Cookie-Editor / EditThisCookie /
// Puppeteer page.cookies()), or a `{ cookies: [...] }` wrapper. Each entry:
//   { name, value, domain, path?, secure?, httpOnly?, sameSite?,
//     expirationDate?/expires?, session? }
// Output: CDP Storage.setCookies params. Chromium performs the actual
// encryption + persistence at its own OSCrypt version, so this module only
// normalizes shapes/enums — no cookie crypto, no schema coupling.
//
// The load-bearing requirement (learned from diagnosis): Google auth cookies
// are HttpOnly (SID, SAPISID, __Secure-3PSID, …). A path that drops HttpOnly,
// or drops `secure` on a `__Secure-*` cookie, silently breaks the signed-in
// session — so those attributes are preserved/enforced here and surfaced to
// the user via inspectCookiesJson().

export interface CdpCookieParam {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  expires?: number
}

// The HttpOnly Google auth cookies that must survive import for a signed-in
// session to persist. Shown as a checklist after import so the user can
// confirm the export captured the HttpOnly ones. __Secure-3PSID is the one
// that (SameSite=None) rides into the third-party reCAPTCHA iframe.
export const AUTH_COOKIE_NAMES = [
  'SID',
  'HSID',
  'SSID',
  'APISID',
  'SAPISID',
  '__Secure-1PSID',
  '__Secure-3PSID',
  '__Secure-1PSIDTS',
  '__Secure-3PSIDTS',
  'LSID'
] as const

export interface CookieInspection {
  ok: boolean
  error?: string // top-level shape error (not an array / bad JSON)
  total: number // cookies accepted
  cookies: CdpCookieParam[]
  skipped: { name?: string; reason: string }[]
  authDetected: Record<string, boolean> // AUTH_COOKIE_NAMES → present among accepted
}

// Cookie-exporter sameSite spellings → CDP enum. 'unspecified'/unknown → omit
// (let chromium apply its default) rather than guess.
function mapSameSite(s: unknown): 'Strict' | 'Lax' | 'None' | undefined {
  const v = String(s ?? '')
    .toLowerCase()
    .replace(/[_-]/g, '')
  if (v === 'norestriction' || v === 'none') return 'None'
  if (v === 'lax') return 'Lax'
  if (v === 'strict') return 'Strict'
  return undefined
}

// Normalize one raw exporter entry into a CDP cookie, or return a skip reason.
function normalizeOne(raw: unknown): {
  cookie?: CdpCookieParam
  skip?: { name?: string; reason: string }
} {
  if (!raw || typeof raw !== 'object') return { skip: { reason: 'not an object' } }
  const c = raw as Record<string, unknown>
  const name = typeof c.name === 'string' ? c.name : null
  const value = typeof c.value === 'string' ? c.value : c.value != null ? String(c.value) : null
  const domain = typeof c.domain === 'string' && c.domain ? c.domain : undefined
  if (!name) return { skip: { reason: 'missing name' } }
  if (value == null) return { skip: { name, reason: 'missing value' } }
  // CDP requires name + value + (domain OR url); we key off domain (exporter form).
  if (!domain) return { skip: { name, reason: 'missing domain' } }

  const ck: CdpCookieParam = { name, value, domain }
  ck.path = typeof c.path === 'string' && c.path ? c.path : '/'
  if (typeof c.secure === 'boolean') ck.secure = c.secure
  if (typeof c.httpOnly === 'boolean') ck.httpOnly = c.httpOnly
  const ss = mapSameSite(c.sameSite)
  if (ss) ck.sameSite = ss
  // Spec: SameSite=None REQUIRES Secure, else chromium rejects the cookie.
  if (ck.sameSite === 'None') ck.secure = true
  // Prefix rules: __Secure-* and __Host-* are rejected without Secure. Enforce
  // it so a real signed-in export (which is always Secure on these) survives
  // even if the exporter omitted the flag.
  if (name.startsWith('__Secure-') || name.startsWith('__Host-')) ck.secure = true
  // Expiry: expirationDate (exporter) or expires (seconds). session:true or
  // none → omit → a session cookie. Values are unix seconds.
  const exp =
    typeof c.expirationDate === 'number'
      ? c.expirationDate
      : typeof c.expires === 'number'
        ? c.expires
        : null
  if (exp != null && c.session !== true && exp > 0) ck.expires = Math.floor(exp)
  return { cookie: ck }
}

// Full inspection for the import UI: accepted cookies + skip reasons + which
// key auth cookies were detected.
export function inspectCookiesJson(json: string | null | undefined): CookieInspection {
  const empty: CookieInspection = { ok: true, total: 0, cookies: [], skipped: [], authDetected: {} }
  if (!json || !json.trim()) return empty
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    return { ...empty, ok: false, error: (e as Error).message.split('\n')[0] }
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { cookies?: unknown })?.cookies)
      ? (parsed as { cookies: unknown[] }).cookies
      : null
  if (!arr) return { ...empty, ok: false, error: 'Expected a JSON array of cookies' }

  const cookies: CdpCookieParam[] = []
  const skipped: { name?: string; reason: string }[] = []
  for (const raw of arr) {
    const { cookie, skip } = normalizeOne(raw)
    if (cookie) cookies.push(cookie)
    else if (skip) skipped.push(skip)
  }
  const names = new Set(cookies.map((c) => c.name))
  const authDetected: Record<string, boolean> = {}
  for (const n of AUTH_COOKIE_NAMES) authDetected[n] = names.has(n)
  return { ok: true, total: cookies.length, cookies, skipped, authDetected }
}

// Launch-path parser: just the accepted cookies. Kept as a stable signature for
// the main-process call site (session-manager → CdpPipe.setCookies).
export function parseCookiesJson(json: string | null | undefined): CdpCookieParam[] {
  return inspectCookiesJson(json).cookies
}
