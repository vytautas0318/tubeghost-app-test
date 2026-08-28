// E.164 → readable phone number, plus the country flag for its dialling code.
//
// Deliberately small: the app only sells US/CA numbers today, so this formats
// NANP properly and falls back to a sensible grouping for anything else rather
// than pulling in a full libphonenumber dependency for one display string.


// Dialling code → ISO country, for the flag prefix. Returns the CODE, not an
// emoji: this app renders flags as SVGs via <Flag code={cc} />, because flag
// emoji have no glyphs on Windows and degrade to bare letters there. NANP (+1) covers US/CA and
// we can't tell them apart from the number alone, so it shows the US flag —
// which is what the app provisions.
const DIAL_TO_CC: { prefix: string; cc: string }[] = [
  { prefix: '1', cc: 'US' },
  { prefix: '44', cc: 'GB' },
  { prefix: '49', cc: 'DE' },
  { prefix: '33', cc: 'FR' },
  { prefix: '31', cc: 'NL' },
  { prefix: '91', cc: 'IN' },
  { prefix: '81', cc: 'JP' },
  { prefix: '61', cc: 'AU' },
  { prefix: '55', cc: 'BR' }
]

/** Flag emoji for an E.164 number, or the globe when the code is unknown. */
export function phoneCountry(e164: string | null | undefined): string | null {
  if (!e164) return ''
  const digits = e164.replace(/[^\d]/g, '')
  // Longest prefix wins so +1 doesn't shadow a longer code.
  const hit = [...DIAL_TO_CC]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((d) => digits.startsWith(d.prefix))
  return hit?.cc ?? null
}

/**
 * Format for display: +1 (202) 555-0147 for NANP, otherwise the dialling code
 * split from the rest. Returns the input unchanged when it isn't parseable, so
 * an unexpected value is shown rather than mangled.
 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return ''
  const digits = e164.replace(/[^\d]/g, '')
  const intl = e164.trim().startsWith('+')

  // NANP: +1 followed by 10 digits. Only treat a bare 10-digit string as NANP
  // when it ISN'T an international number — otherwise a 10-digit German number
  // (+49 30 123456) would be rendered as a US area code.
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10 && !intl) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  const hit = [...DIAL_TO_CC]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((d) => digits.startsWith(d.prefix))
  if (hit) {
    const rest = digits.slice(hit.prefix.length)
    // Group from the RIGHT in 3s so no stray single digit is left dangling at
    // the end (+44 207 183 875 0 → +44 207 183 8750).
    const groups: string[] = []
    for (let i = rest.length; i > 0; i -= 3) groups.unshift(rest.slice(Math.max(0, i - 3), i))
    if (groups.length > 1 && groups[0].length === 1) {
      groups[1] = groups[0] + groups[1]
      groups.shift()
    }
    return `+${hit.prefix} ${groups.join(' ')}`
  }
  return e164
}
