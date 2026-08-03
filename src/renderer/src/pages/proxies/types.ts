// Shared view-model types + small format helpers used across the
// Proxies page sub-components.

import type { ProxyRow } from '@/lib/proxies'

export interface ViewProxy extends ProxyRow {
  profileCount: number
  // Sorted ascending list of profile_numbers using this proxy. Drives
  // the Proxies table's "Profiles" column display ("#1, #12, #35").
  profileNumbers: number[]
  expiresRelative: string | null
  lastSyncedRelative: string | null
  // True when another proxy in the workspace has the same host:port but a
  // DIFFERENT source — i.e. the same endpoint exists both as a synced
  // TubeProxies row and a manually-added custom row. Non-destructive: both
  // rows stay; the UI flags them so the duplication is obvious.
  duplicateOfOtherSource: boolean
}

// Any ISO-3166 alpha-2 country code → its flag emoji (regional indicators),
// so the proxy's real IP-location country shows the correct flag. Non-2-letter
// input (or a full country name) falls back to the globe.
export function flagFor(country: string | null): string {
  if (!country) return ''
  const cc = country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return '🌐'
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)))
}

// Compact display names for the handful of verbose official country names the
// proxy provider returns, so the Location column reads cleanly. Anything not
// listed is returned unchanged (and the cell still truncates as a backstop).
const COUNTRY_SHORT: Record<string, string> = {
  'United States of America': 'United States',
  'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
  'Russian Federation': 'Russia',
  'Republic of Korea': 'South Korea',
  "Korea, Democratic People's Republic of": 'North Korea',
  'Iran, Islamic Republic of': 'Iran',
  'Venezuela, Bolivarian Republic of': 'Venezuela',
  'Bolivia, Plurinational State of': 'Bolivia',
  'Tanzania, United Republic of': 'Tanzania',
  'Moldova, Republic of': 'Moldova',
  'Syrian Arab Republic': 'Syria',
  "Lao People's Democratic Republic": 'Laos',
  'Viet Nam': 'Vietnam',
  'Czechia': 'Czech Republic',
  'Taiwan, Province of China': 'Taiwan',
  'Hong Kong': 'Hong Kong',
  'United Arab Emirates': 'UAE'
}

export function shortCountry(name: string | null): string {
  if (!name) return ''
  return COUNTRY_SHORT[name.trim()] ?? name
}
