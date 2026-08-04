// Minimal .xlsx reader — enough to turn a vendor's exported spreadsheet into
// the same header→cell grid the CSV path produces.
//
// Why not SheetJS: the npm-published `xlsx` is pinned at 0.18.5 (prototype
// pollution, CVE-2023-30533; fixes only ship from the vendor's own CDN) and
// carries a full formula/style engine we'd never use. An .xlsx is just a ZIP of
// XML, and we only need the first worksheet's cell text — that's ~100 lines on
// top of fflate, with no parser to keep patched.
//
// Scope: values as displayed-ish text (shared strings, inline strings, numbers,
// booleans). Formulas resolve to their cached value, which is what an export
// contains. Dates come through as serial numbers — no vendor puts a date in the
// columns we map, so we don't guess at date formats.

import { unzipSync, strFromU8 } from 'fflate'
import { normalizeHeader } from './csv'

// Legacy .xls (BIFF) is a compound binary file, not a ZIP — detect it so the
// user gets "re-save as .xlsx or CSV" instead of a confusing unzip error.
const XLS_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]

function isLegacyXls(bytes: Uint8Array): boolean {
  return XLS_MAGIC.every((b, i) => bytes[i] === b)
}

// Strip tags and decode the five XML entities. Cell text is plain text; rich
// text runs (<r><t>…</t></r>) concatenate, which is what the cell displays.
function xmlText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// "BC12" → 54 (0-based column index). Sheets omit empty cells entirely, so the
// reference is the only way to keep columns aligned with their headers.
function colIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) out.push(xmlText(m[1]))
  return out
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1]
      const body = cellMatch[2] ?? ''
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /t="([^"]+)"/.exec(attrs)?.[1]

      let value: string
      if (type === 's') {
        // Shared string: <v> holds the index into sharedStrings.xml.
        const idx = Number(xmlText(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''))
        value = Number.isFinite(idx) ? (shared[idx] ?? '') : ''
      } else if (type === 'inlineStr') {
        value = xmlText(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
      } else if (type === 'b') {
        value = xmlText(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '') === '1' ? 'TRUE' : 'FALSE'
      } else {
        value = xmlText(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
      }

      const at = ref ? colIndex(ref) : cells.length
      while (cells.length < at) cells.push('')
      cells[at] = value
    }
    rows.push(cells)
  }
  return rows
}

/** First worksheet of an .xlsx as a raw grid. Throws user-readable errors. */
export function parseXlsxGrid(buf: ArrayBuffer): string[][] {
  const bytes = new Uint8Array(buf)
  if (isLegacyXls(bytes)) {
    throw new Error('Old .xls files aren’t supported — re-save as .xlsx or CSV')
  }
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('That file isn’t a readable .xlsx workbook')
  }

  // Sheet order in workbook.xml is the tab order; the relationship id maps to
  // the actual part path. Falling back to sheet1.xml covers exports whose rels
  // we can't follow.
  const sheetPaths = Object.keys(files).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p))
  if (sheetPaths.length === 0) throw new Error('The workbook has no worksheets')
  sheetPaths.sort((a, b) => {
    const n = (s: string): number => Number(/sheet(\d+)\.xml/i.exec(s)?.[1] ?? 0)
    return n(a) - n(b)
  })

  const sharedPath = Object.keys(files).find((p) => /^xl\/sharedStrings\.xml$/i.test(p))
  const shared = sharedPath ? parseSharedStrings(strFromU8(files[sharedPath])) : []
  return parseSheet(strFromU8(files[sheetPaths[0]]), shared)
}

/**
 * Rows as objects keyed by normalized header — the same shape csvToObjects()
 * produces, so the vendor field mapping is shared with the CSV path.
 */
export function xlsxToObjects(buf: ArrayBuffer): Record<string, string>[] {
  const grid = parseXlsxGrid(buf)
  // Vendor sheets sometimes open with a title/blank row: use the first row that
  // has at least two non-empty cells as the header.
  const headerIdx = grid.findIndex((r) => r.filter((c) => c.trim()).length >= 2)
  if (headerIdx === -1) return []
  const headers = grid[headerIdx].map(normalizeHeader)
  return grid.slice(headerIdx + 1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      const v = (cells[i] ?? '').trim()
      if (h && v) obj[h] = v
    })
    return obj
  })
}
