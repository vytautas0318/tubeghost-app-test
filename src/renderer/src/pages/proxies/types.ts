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
