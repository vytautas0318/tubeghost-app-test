// Minimal RFC-4180-ish CSV parser (quoted fields, escaped quotes, CR/LF).
// No dependency: the import surface only needs headers + string cells.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const pushCell = (): void => {
    row.push(cell)
    cell = ''
  }
  const pushRow = (): void => {
    // Skip fully-empty trailing rows.
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushCell()
    } else if (ch === '\n') {
      pushCell()
      pushRow()
    } else if (ch !== '\r') {
      cell += ch
    }
  }
  pushCell()
  pushRow()
  return rows
}

// "Proxy Host " → "proxyhost": header keys are compared alnum-only lowercase
// so vendor spelling differences (proxy_host / proxyHost / Proxy IP) collapse.
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// First value whose normalized header STARTS WITH one of the prefixes. Vendor
// sheets decorate headers ("Tags (separate with commas)", "Tag name"), which an
// exact-key lookup misses. Prefix — not "contains" — so "Proxy tag" does NOT
// answer a query for the profile's own tags.
export function pickPrefix(o: Record<string, unknown>, ...prefixes: string[]): unknown {
  for (const p of prefixes) {
    for (const k of Object.keys(o)) {
      if (k.startsWith(p) && o[k] != null && o[k] !== '') return o[k]
    }
  }
  return null
}

// Rows as objects keyed by normalized header. Empty cells → absent.
export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const headers = rows[0].map(normalizeHeader)
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      const v = (cells[i] ?? '').trim()
      if (h && v) obj[h] = v
    })
    return obj
  })
}
