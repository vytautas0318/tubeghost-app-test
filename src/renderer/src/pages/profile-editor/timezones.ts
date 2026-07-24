// IANA timezone list for the Custom-timezone dropdown (AdsPower-style:
// "GMT-06:00 America/Denver", sorted by UTC offset). Generated once at module
// load from the runtime's own Intl database so it never goes stale and needs no
// hand-maintained table. The stored value is the bare IANA id (e.g.
// "America/Denver") — exactly what the launcher already writes to --timezone.

export interface TzOption {
  /** IANA id stored in profile.timezone, e.g. "America/Denver". */
  value: string
  /** Display label, e.g. "GMT-06:00 America/Denver". */
  label: string
  /** Offset in minutes (current date), for sorting only. */
  offset: number
}

// Intl.supportedValuesOf is ES2022; access it defensively so the build target
// can't break compilation, with a small fallback if the runtime lacks it.
type IntlWithSupported = typeof Intl & {
  supportedValuesOf?(key: 'timeZone'): string[]
}

const FALLBACK_ZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Australia/Sydney'
]

// Parse "GMT", "GMT-06:00", "GMT+05:30" → signed minutes.
function offsetMinutes(longOffset: string): number {
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(longOffset)
  if (!m) return 0 // plain "GMT" == UTC
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number(m[2]) * 60 + Number(m[3]))
}

function build(): TzOption[] {
  const now = new Date()
  const zones = (Intl as IntlWithSupported).supportedValuesOf?.('timeZone') ?? FALLBACK_ZONES
  const opts: TzOption[] = []
  for (const tz of zones) {
    let raw = 'GMT'
    try {
      raw =
        new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
          .formatToParts(now)
          .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    } catch {
      continue // invalid/unsupported id — skip
    }
    const norm = raw === 'GMT' ? 'GMT+00:00' : raw
    opts.push({ value: tz, label: `${norm} ${tz}`, offset: offsetMinutes(raw) })
  }
  opts.sort((a, b) => a.offset - b.offset || a.value.localeCompare(b.value))
  return opts
}

export const TIMEZONE_OPTIONS: TzOption[] = build()
