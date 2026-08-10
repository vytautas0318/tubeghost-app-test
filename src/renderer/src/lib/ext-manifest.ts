// Chrome extension manifest.json analysis — the ONE place that derives the
// user-facing permission-scope badge and category from a parsed manifest.
//
// Both MV2 and MV3 shapes are handled: MV3 splits host access into
// `host_permissions`, MV2 mixes hosts into `permissions`. We treat either.
//
// Pure functions, no I/O — shared by the .crx upload path and the Web Store
// fetch path (both feed the same parser in lib/crx.ts).

import type { PermissionScope } from './extensions'

export interface ParsedManifest {
  manifest_version?: number
  name?: string
  version?: string
  description?: string
  author?: string | { email?: string }
  // MV2: hosts + api perms mixed. MV3: api perms only.
  permissions?: string[]
  // MV2 only.
  optional_permissions?: string[]
  // MV3: host access lives here.
  host_permissions?: string[]
  icons?: Record<string, string>
  default_locale?: string
  options_page?: string
  options_ui?: { page?: string }
  action?: { default_icon?: string | Record<string, string> }
  browser_action?: { default_icon?: string | Record<string, string> }
  // MV2 default popup icon lives on browser_action; MV3 on action.
  [k: string]: unknown
}

// Host patterns that mean "every site" → broad.
const ALL_HOSTS = [
  '<all_urls>',
  '*://*/*',
  'http://*/*',
  'https://*/*',
  '*://*/',
  'http://*/',
  'https://*/'
]

// API permissions that are high-risk regardless of host access → broad.
const HIGH_RISK_PERMS = new Set([
  'debugger',
  'proxy',
  'webRequest',
  'webRequestBlocking',
  'declarativeNetRequest',
  'declarativeNetRequestWithHostAccess',
  'cookies',
  'management',
  'nativeMessaging',
  'privacy',
  'content_settings',
  'contentSettings'
])

function isHostPattern(p: string): boolean {
  // A host permission contains a scheme+host pattern; API permissions are
  // bare identifiers ("storage", "tabs"). Heuristic: contains "://" or is a
  // recognised all-hosts token.
  return p.includes('://') || ALL_HOSTS.includes(p)
}

function isBroadHost(p: string): boolean {
  if (ALL_HOSTS.includes(p)) return true
  // e.g. "*://*.example.com/*" is scoped; "*://*/*" is broad (caught above).
  // A wildcard host with a wildcard domain root ("*://*") is broad.
  return /^[*a-z]+:\/\/\*\/?\*?$/i.test(p)
}

// Split a manifest's declared permissions into host patterns vs API perms,
// merging MV2 (mixed in `permissions`) and MV3 (`host_permissions`).
function collectPerms(m: ParsedManifest): { hosts: string[]; apis: string[] } {
  const raw = [
    ...(Array.isArray(m.permissions) ? m.permissions : []),
    ...(Array.isArray(m.host_permissions) ? m.host_permissions : [])
  ].filter((p): p is string => typeof p === 'string')
  const hosts = raw.filter(isHostPattern)
  const apis = raw.filter((p) => !isHostPattern(p))
  return { hosts, apis }
}

// Derive the permission-scope badge from the manifest:
//   broad   → <all_urls> / broad host_permissions, or high-risk API perms
//   minimal → essentially no host permissions
//   limited → in between (some scoped host permissions)
export function derivePermissionScope(m: ParsedManifest): PermissionScope {
  const { hosts, apis } = collectPerms(m)
  if (hosts.some(isBroadHost)) return 'broad'
  if (apis.some((p) => HIGH_RISK_PERMS.has(p))) return 'broad'
  if (hosts.length === 0) return 'minimal'
  return 'limited'
}

// Best-effort category guess from name/description/permissions. The user
// can't set this by hand in the current UI, so we classify heuristically;
// falls back to 'Utility'. Kept simple + deterministic.
export function deriveCategory(m: ParsedManifest): string {
  const text = `${m.name ?? ''} ${m.description ?? ''}`.toLowerCase()
  const has = (...kw: string[]): boolean => kw.some((k) => text.includes(k))
  if (has('seo', 'keyword', 'tag', 'rank')) return 'SEO & tags'
  if (has('niche', 'research', 'outlier', 'analytics', 'analyz')) return 'Niche research'
  if (has('monet', 'revenue', 'earnings', 'ad ', 'ads', 'sponsor')) return 'Monetization'
  if (has('thumbnail', 'title', 'creator', 'a/b', 'shorts')) return 'Creator'
  if (has('script', 'chatgpt', 'ai ', 'gpt', 'prompt')) return 'Scripting'
  if (has('edit', 'clip', 'trim', 'caption', 'subtitle')) return 'Editing'
  return 'Utility'
}

// Publisher/developer name from the manifest. MV3 `author` can be a string
// or an object; falls back to the extension name.
export function derivePublisher(m: ParsedManifest): string {
  if (typeof m.author === 'string' && m.author.trim()) return m.author.trim()
  if (m.author && typeof m.author === 'object' && typeof m.author.email === 'string') {
    return m.author.email
  }
  return m.name?.trim() || 'Unknown'
}

// The manifest-declared options page (relative path), if any.
export function deriveOptionsPage(m: ParsedManifest): string | null {
  if (typeof m.options_page === 'string' && m.options_page) return m.options_page
  if (m.options_ui && typeof m.options_ui.page === 'string') return m.options_ui.page
  return null
}

// Largest declared icon's relative path (for reading + embedding as a data
// URL). Prefers `icons`, then action/browser_action default_icon.
export function largestIconPath(m: ParsedManifest): string | null {
  const fromMap = (icons?: Record<string, string>): string | null => {
    if (!icons) return null
    const sizes = Object.keys(icons)
      .map((s) => parseInt(s, 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => b - a)
    return sizes.length > 0 ? icons[String(sizes[0])] : null
  }
  const primary = fromMap(m.icons)
  if (primary) return primary
  const actionIcon = m.action?.default_icon ?? m.browser_action?.default_icon
  if (typeof actionIcon === 'string') return actionIcon
  if (actionIcon && typeof actionIcon === 'object') return fromMap(actionIcon)
  return null
}
