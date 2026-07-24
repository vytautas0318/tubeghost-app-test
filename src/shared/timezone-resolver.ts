// Static (country_code, region) → IANA timezone resolver.
//
// Why static instead of an API:
//   ip2location's free tier returns UTC offsets like "-07:00", not
//   IANA names like "America/Denver". Chromium's --fingerprint-timezone
//   flag REQUIRES IANA names; offsets get silently ignored. Building
//   this mapping ourselves is more reliable than upgrading our API
//   plan, and works offline.
//
// Why not just country_code → timezone:
//   Multi-timezone countries (US, CA, RU, AU, BR, MX) span 4+ zones.
//   A US Wyoming proxy needs America/Denver; a US California proxy
//   needs America/Los_Angeles. Country alone isn't enough for these.
//
// Coverage strategy:
//   1. Multi-zone countries get a (region → timezone) table
//   2. Single-zone countries get a country → timezone fallback
//   3. Anything else falls back to UTC (chromium accepts UTC; better
//      than failing the launch)

export interface TimezoneInput {
  country_code: string | null
  region: string | null
}

// US state → IANA. Covers all 50 states + DC + major territories.
// Boundaries: Indiana + Kentucky + Tennessee straddle Eastern/Central
// internally; we pick the more populous half.
const US_STATE_TZ: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',     // no DST
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  DC: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',    // no DST
  ID: 'America/Boise',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York',    // most populous half is Eastern
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',     // most populous half is Central
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
  // Territories
  PR: 'America/Puerto_Rico',
  VI: 'America/Puerto_Rico',
  GU: 'Pacific/Guam',
  AS: 'Pacific/Pago_Pago'
}

// US-state full-name → IANA (so we accept either "Wyoming" or "WY").
const US_STATE_NAME_TZ: Record<string, string> = {
  alabama: US_STATE_TZ.AL,
  alaska: US_STATE_TZ.AK,
  arizona: US_STATE_TZ.AZ,
  arkansas: US_STATE_TZ.AR,
  california: US_STATE_TZ.CA,
  colorado: US_STATE_TZ.CO,
  connecticut: US_STATE_TZ.CT,
  delaware: US_STATE_TZ.DE,
  'district of columbia': US_STATE_TZ.DC,
  florida: US_STATE_TZ.FL,
  georgia: US_STATE_TZ.GA,
  hawaii: US_STATE_TZ.HI,
  idaho: US_STATE_TZ.ID,
  illinois: US_STATE_TZ.IL,
  indiana: US_STATE_TZ.IN,
  iowa: US_STATE_TZ.IA,
  kansas: US_STATE_TZ.KS,
  kentucky: US_STATE_TZ.KY,
  louisiana: US_STATE_TZ.LA,
  maine: US_STATE_TZ.ME,
  maryland: US_STATE_TZ.MD,
  massachusetts: US_STATE_TZ.MA,
  michigan: US_STATE_TZ.MI,
  minnesota: US_STATE_TZ.MN,
  mississippi: US_STATE_TZ.MS,
  missouri: US_STATE_TZ.MO,
  montana: US_STATE_TZ.MT,
  nebraska: US_STATE_TZ.NE,
  nevada: US_STATE_TZ.NV,
  'new hampshire': US_STATE_TZ.NH,
  'new jersey': US_STATE_TZ.NJ,
  'new mexico': US_STATE_TZ.NM,
  'new york': US_STATE_TZ.NY,
  'north carolina': US_STATE_TZ.NC,
  'north dakota': US_STATE_TZ.ND,
  ohio: US_STATE_TZ.OH,
  oklahoma: US_STATE_TZ.OK,
  oregon: US_STATE_TZ.OR,
  pennsylvania: US_STATE_TZ.PA,
  'rhode island': US_STATE_TZ.RI,
  'south carolina': US_STATE_TZ.SC,
  'south dakota': US_STATE_TZ.SD,
  tennessee: US_STATE_TZ.TN,
  texas: US_STATE_TZ.TX,
  utah: US_STATE_TZ.UT,
  vermont: US_STATE_TZ.VT,
  virginia: US_STATE_TZ.VA,
  washington: US_STATE_TZ.WA,
  'west virginia': US_STATE_TZ.WV,
  wisconsin: US_STATE_TZ.WI,
  wyoming: US_STATE_TZ.WY
}

// Canadian provinces. Most have one timezone; QC + ON have minor splits
// we ignore (most-populous wins).
const CA_PROVINCE_TZ: Record<string, string> = {
  AB: 'America/Edmonton',
  BC: 'America/Vancouver',
  MB: 'America/Winnipeg',
  NB: 'America/Moncton',
  NL: 'America/St_Johns',
  NS: 'America/Halifax',
  NT: 'America/Yellowknife',
  NU: 'America/Iqaluit',
  ON: 'America/Toronto',
  PE: 'America/Halifax',
  QC: 'America/Toronto',  // most-populous half (Montreal) is on Toronto
  SK: 'America/Regina',   // no DST
  YT: 'America/Whitehorse'
}

// Australian states. Single zone per state (with DST opt-outs).
const AU_STATE_TZ: Record<string, string> = {
  ACT: 'Australia/Sydney',
  NSW: 'Australia/Sydney',
  NT: 'Australia/Darwin',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  TAS: 'Australia/Hobart',
  VIC: 'Australia/Melbourne',
  WA: 'Australia/Perth'
}

// Country code → primary timezone for single-timezone countries.
// (For multi-timezone countries — US, CA, AU, RU, BR, MX — we look up
// region above. If region matching fails, fallback here is "good enough".)
const COUNTRY_TZ: Record<string, string> = {
  // Multi-zone country defaults (used only when region match fails)
  US: 'America/New_York',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  RU: 'Europe/Moscow',
  BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City',
  // Europe
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  PT: 'Europe/Lisbon',
  ES: 'Europe/Madrid',
  FR: 'Europe/Paris',
  BE: 'Europe/Brussels',
  NL: 'Europe/Amsterdam',
  LU: 'Europe/Luxembourg',
  DE: 'Europe/Berlin',
  AT: 'Europe/Vienna',
  CH: 'Europe/Zurich',
  IT: 'Europe/Rome',
  DK: 'Europe/Copenhagen',
  NO: 'Europe/Oslo',
  SE: 'Europe/Stockholm',
  FI: 'Europe/Helsinki',
  IS: 'Atlantic/Reykjavik',
  PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague',
  SK: 'Europe/Bratislava',
  HU: 'Europe/Budapest',
  RO: 'Europe/Bucharest',
  BG: 'Europe/Sofia',
  GR: 'Europe/Athens',
  TR: 'Europe/Istanbul',
  UA: 'Europe/Kyiv',
  // Asia
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  CN: 'Asia/Shanghai',
  TW: 'Asia/Taipei',
  HK: 'Asia/Hong_Kong',
  SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',
  VN: 'Asia/Ho_Chi_Minh',
  ID: 'Asia/Jakarta',
  PH: 'Asia/Manila',
  MY: 'Asia/Kuala_Lumpur',
  IN: 'Asia/Kolkata',
  PK: 'Asia/Karachi',
  AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
  IL: 'Asia/Jerusalem',
  // Latin America
  AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago',
  CO: 'America/Bogota',
  PE: 'America/Lima',
  // Africa
  ZA: 'Africa/Johannesburg',
  EG: 'Africa/Cairo',
  NG: 'Africa/Lagos',
  KE: 'Africa/Nairobi',
  // Oceania
  NZ: 'Pacific/Auckland'
}

/**
 * Resolve an IANA timezone from country + region. Always returns a
 * usable IANA name — falls back to UTC if the country isn't in our
 * table at all (better than failing the launch).
 */
export function resolveTimezone(input: TimezoneInput): string {
  const cc = input.country_code?.toUpperCase()
  const region = input.region?.trim()
  if (!cc) return 'UTC'

  // Multi-zone countries: try region match first.
  if (cc === 'US' && region) {
    // Accept either "WY" or "Wyoming" (or any case)
    const upper = region.toUpperCase()
    if (US_STATE_TZ[upper]) return US_STATE_TZ[upper]
    const lower = region.toLowerCase()
    if (US_STATE_NAME_TZ[lower]) return US_STATE_NAME_TZ[lower]
  }
  if (cc === 'CA' && region) {
    const upper = region.toUpperCase()
    if (CA_PROVINCE_TZ[upper]) return CA_PROVINCE_TZ[upper]
  }
  if (cc === 'AU' && region) {
    const upper = region.toUpperCase()
    if (AU_STATE_TZ[upper]) return AU_STATE_TZ[upper]
  }

  // Single-zone countries (or fallback for unmapped multi-zone regions).
  return COUNTRY_TZ[cc] ?? 'UTC'
}
