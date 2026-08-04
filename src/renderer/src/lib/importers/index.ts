// Orchestrates the Profiles → Import menu: parse the chosen file (vendor
// export / CSV / spreadsheet / cookie file) and create real workspace profiles
// via the standard data layer, so every import gets the same safe-by-default
// fingerprint + RLS treatment as a hand-created profile.

import { createProfile, importProfile, updateProfile, type ProfileRow } from '@/lib/profiles'
import { createGroup, listGroups, PRESET_COLORS } from '@/lib/groups'
import { createTag, listTags, TAG_PRESET_COLORS } from '@/lib/tags'
import {
  isTubeGhostExport,
  parseForeignProfiles,
  profilesFromRecords,
  type ParsedProfile,
  type ImportVendor
} from './foreign'
import { xlsxToObjects } from './xlsx'
import { normalizeCookieFile } from './cookies'

export type { ImportVendor } from './foreign'

export interface ImportSummary {
  created: number
  failed: number
  errors: string[]
}

// File-picker accept filter per menu entry. Spreadsheets are offered only where
// they're actually readable (.xlsx — see importers/xlsx.ts); legacy .xls is a
// different binary format and is NOT offered, so nobody picks a file we have to
// reject afterwards.
export const VENDOR_ACCEPT: Record<ImportVendor, string> = {
  multilogin: '.json,application/json',
  adspower: '.csv,.txt,.xlsx',
  gologin: '.json,application/json',
  dolphin: '.json,application/json',
  incogniton: '.csv,.txt,.xlsx',
  csv: '.csv,.txt,.xlsx'
}

// Resolve a vendor's group NAME to a workspace group id, creating the group on
// first sight. Cached per import run so a 500-row file does one lookup per
// distinct group rather than per row.
class GroupResolver {
  private byName = new Map<string, string>()
  private loaded = false

  constructor(private readonly workspaceId: string) {}

  async resolve(name?: string | null): Promise<string | null> {
    const clean = name?.trim()
    if (!clean) return null
    if (!this.loaded) {
      const existing = await listGroups(this.workspaceId).catch(() => [])
      for (const g of existing) this.byName.set(g.name.toLowerCase(), g.id)
      this.loaded = true
    }
    const key = clean.toLowerCase()
    const hit = this.byName.get(key)
    if (hit) return hit
    try {
      const color = PRESET_COLORS[this.byName.size % PRESET_COLORS.length]
      const g = await createGroup(this.workspaceId, clean.slice(0, 60), color)
      this.byName.set(key, g.id)
      return g.id
    } catch {
      // No groups.create permission (or a race) — import the profile ungrouped
      // rather than failing the whole row over a label.
      return null
    }
  }
}

// Register imported tag NAMES in the workspace tag registry (migration 0019).
// profiles.tags stores names only, so writing the array is enough to render a
// chip — but a name absent from the registry has no color row, never shows up
// as a suggestion in the tag picker, and can't be renamed or recolored. Same
// caching + fail-soft contract as GroupResolver.
class TagResolver {
  private seen = new Set<string>()
  private loaded = false

  constructor(private readonly workspaceId: string) {}

  async register(names: string[]): Promise<void> {
    if (names.length === 0) return
    if (!this.loaded) {
      const existing = await listTags(this.workspaceId).catch(() => [])
      for (const t of existing) this.seen.add(t.name.trim().toLowerCase())
      this.loaded = true
    }
    for (const raw of names) {
      const name = raw.trim()
      const key = name.toLowerCase()
      if (!name || this.seen.has(key)) continue
      this.seen.add(key)
      const color = TAG_PRESET_COLORS[(this.seen.size - 1) % TAG_PRESET_COLORS.length]
      // No tags.create permission (or a race) — keep the tag on the profile
      // anyway; it just falls back to the legacy name-hash color.
      await createTag(this.workspaceId, name.slice(0, 60), color).catch(() => undefined)
    }
  }
}

async function createFromParsed(
  p: ParsedProfile,
  workspaceId: string,
  groups: GroupResolver,
  tags: TagResolver
): Promise<ProfileRow> {
  await tags.register(p.tags ?? [])
  const row = await createProfile({
    workspace_id: workspaceId,
    name: p.name.slice(0, 100),
    notes: p.notes ?? null,
    tags: p.tags ?? [],
    platform: p.platform ?? null,
    group_id: await groups.resolve(p.group)
  })
  const patch: Parameters<typeof updateProfile>[1] = {}
  if (p.proxy) {
    patch.proxy_type = p.proxy.type
    patch.proxy_host = p.proxy.host
    patch.proxy_port = p.proxy.port
    patch.proxy_user = p.proxy.user ?? null
    patch.proxy_pass = p.proxy.pass ?? null
    patch.proxy_source = 'custom'
  }
  if (p.cookiesJson) patch.cookies_json = p.cookiesJson
  if (Object.keys(patch).length > 0) return updateProfile(row.id, patch)
  return row
}

// True for a ZIP container — every .xlsx is one. Checked on the BYTES rather
// than the extension so a renamed file still routes correctly.
function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b
}

// Vendor/CSV/spreadsheet import: N parsed records → N new profiles. Sequential
// inserts so the profile_number trigger and RLS evaluate row-by-row; per-row
// failures don't abort the batch.
export async function importForeignFile(file: File, workspaceId: string): Promise<ImportSummary> {
  const base = file.name.replace(/\.[^.]+$/, '') || 'Imported profile'
  const bytes = new Uint8Array(await file.arrayBuffer())

  let parsed: ParsedProfile[]
  if (isZip(bytes) || /\.xlsx$/i.test(file.name)) {
    // Spreadsheet: read the first worksheet as a header grid and run it through
    // the same field mapping as CSV.
    parsed = profilesFromRecords(xlsxToObjects(bytes.buffer as ArrayBuffer), base)
    if (parsed.length === 0) {
      throw new Error('No rows found in the sheet — is the header row missing?')
    }
  } else {
    const text = await file.text()

    // A TubeGhost export dropped into the CSV / vendor entry: route it to the
    // full-fidelity importer rather than the foreign mapper, which would keep
    // only name+proxy+cookies (and, for our envelope shape, not even those).
    // Users don't reliably distinguish "Profile file (.json)" from "CSV" — the
    // file itself says what it is, so honour that.
    if (isTubeGhostExport(text)) {
      try {
        await importProfile(text, workspaceId)
        return { created: 1, failed: 0, errors: [] }
      } catch (e) {
        return { created: 0, failed: 1, errors: [(e as Error).message] }
      }
    }
    parsed = parseForeignProfiles(file.name, text)
  }

  const groups = new GroupResolver(workspaceId)
  const tags = new TagResolver(workspaceId)
  const summary: ImportSummary = { created: 0, failed: 0, errors: [] }
  for (const p of parsed) {
    try {
      await createFromParsed(p, workspaceId, groups, tags)
      summary.created += 1
    } catch (e) {
      summary.failed += 1
      summary.errors.push(`${p.name}: ${(e as Error).message}`)
    }
  }
  return summary
}

// Cookie-file import: one new profile carrying the cookies (injected via CDP
// at first launch). Named after the file.
export async function importCookiesFile(
  file: File,
  workspaceId: string
): Promise<{ name: string; count: number }> {
  const text = await file.text()
  const { json, count } = normalizeCookieFile(text)
  const name = (file.name.replace(/\.[^.]+$/, '') || 'Imported cookies').slice(0, 100)
  await new TagResolver(workspaceId).register(['imported'])
  const row = await createProfile({ workspace_id: workspaceId, name, tags: ['imported'] })
  await updateProfile(row.id, { cookies_json: json })
  return { name, count }
}
