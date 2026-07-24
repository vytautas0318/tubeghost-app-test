// Thin typed wrapper around Supabase Edge Function invocations.
// All functions live in supabase/functions/<name>/index.ts and are
// deployed via `npx supabase functions deploy <name>`.
//
// Why this layer: keeps the function names + payload types in one place
// (instead of scattering them across renderer pages), and centralises
// auth-error handling.
//
// NOTE: proxy-test was moved out of here to lib/proxy-test.ts (uses local
// Electron IPC instead of an Edge Function — see CLAUDE.md "IPC vs Edge"
// for the rule on which path each operation should take).

import { getSupabase } from '@/lib/supabase'

export interface IpLookupResult {
  country_code: string | null
  country_name: string | null
  city: string | null
  region: string | null
  timezone: string | null
}

function client() {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured')
  return c
}

export async function lookupIp(ip: string): Promise<IpLookupResult> {
  const { data, error } = await client().functions.invoke<
    IpLookupResult | { error: string }
  >('ip2location-lookup', { body: { ip } })
  if (error) throw error
  if (data && 'error' in data) throw new Error(data.error)
  return data as IpLookupResult
}

// Country code → BCP-47 primary language tag. Hand-curated; only the
// languages we want to surface as defaults. Unknown codes fall back to
// en-US so we never end up with a blank --lang flag.
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  US: 'en-US', GB: 'en-GB', AU: 'en-AU', CA: 'en-CA', NZ: 'en-NZ', IE: 'en-IE',
  DE: 'de-DE', AT: 'de-AT', CH: 'de-CH',
  FR: 'fr-FR', BE: 'fr-BE',
  ES: 'es-ES', MX: 'es-MX', AR: 'es-AR', CO: 'es-CO', CL: 'es-CL',
  IT: 'it-IT',
  PT: 'pt-PT', BR: 'pt-BR',
  NL: 'nl-NL',
  PL: 'pl-PL',
  RU: 'ru-RU', UA: 'uk-UA',
  JP: 'ja-JP', KR: 'ko-KR',
  CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-HK',
  ID: 'id-ID', VN: 'vi-VN', TH: 'th-TH', MY: 'ms-MY', PH: 'fil-PH',
  IN: 'en-IN', PK: 'en-PK',
  TR: 'tr-TR', SE: 'sv-SE', NO: 'nb-NO', DK: 'da-DK', FI: 'fi-FI'
}

export function languageForCountry(code: string | null): string {
  if (!code) return 'en-US'
  return COUNTRY_TO_LANGUAGE[code.toUpperCase()] ?? 'en-US'
}

// Country → coarse capital-city centroid. Used when the Geo override
// is set to "Based on IP" and we need lat/lon for the geolocation
// shim. Coordinates are intentionally city-level — plausible for a
// random consumer IP without pretending we know the precise location.
const COUNTRY_TO_LATLON: Record<string, [number, number]> = {
  US: [40.7128, -74.0060], GB: [51.5074, -0.1278], CA: [45.4215, -75.6972],
  AU: [-33.8688, 151.2093], NZ: [-36.8485, 174.7633], IE: [53.3498, -6.2603],
  DE: [52.5200, 13.4050], AT: [48.2082, 16.3738], CH: [47.3769, 8.5417],
  FR: [48.8566, 2.3522], BE: [50.8503, 4.3517], NL: [52.3676, 4.9041],
  ES: [40.4168, -3.7038], IT: [41.9028, 12.4964], PT: [38.7223, -9.1393],
  MX: [19.4326, -99.1332], AR: [-34.6037, -58.3816], BR: [-15.7942, -47.8822],
  CL: [-33.4489, -70.6693], CO: [4.7110, -74.0721],
  JP: [35.6762, 139.6503], KR: [37.5665, 126.9780], CN: [39.9042, 116.4074],
  TW: [25.0330, 121.5654], HK: [22.3193, 114.1694],
  IN: [28.6139, 77.2090], PK: [33.6844, 73.0479],
  ID: [-6.2088, 106.8456], VN: [21.0285, 105.8542], TH: [13.7563, 100.5018],
  MY: [3.1390, 101.6869], PH: [14.5995, 120.9842],
  RU: [55.7558, 37.6173], UA: [50.4501, 30.5234], TR: [41.0082, 28.9784],
  PL: [52.2297, 21.0122], SE: [59.3293, 18.0686], NO: [59.9139, 10.7522],
  DK: [55.6761, 12.5683], FI: [60.1699, 24.9384]
}

export function latLonForCountry(code: string | null): [number, number] | null {
  if (!code) return null
  return COUNTRY_TO_LATLON[code.toUpperCase()] ?? null
}
