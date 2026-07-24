// Orchestrates the Profiles → Import menu: parse the chosen file (vendor
// export / CSV / cookie file) and create real workspace profiles via the
// standard data layer, so every import gets the same safe-by-default
// fingerprint + RLS treatment as a hand-created profile.

import { createProfile, updateProfile, type ProfileRow } from '@/lib/profiles'
import { parseForeignProfiles, type ParsedProfile, type ImportVendor } from './foreign'
import { normalizeCookieFile } from './cookies'

export type { ImportVendor } from './foreign'

export interface ImportSummary {
  created: number
  failed: number
  errors: string[]
}

// File-picker accept filter per menu entry.
export const VENDOR_ACCEPT: Record<ImportVendor, string> = {
  multilogin: '.json,application/json',
  adspower: '.csv,.txt,.xlsx,.xls',
  gologin: '.json,application/json',
  dolphin: '.json,application/json',
  incogniton: '.csv,.txt',
  csv: '.csv,.txt,.xlsx,.xls'
}

async function createFromParsed(p: ParsedProfile, workspaceId: string): Promise<ProfileRow> {
  const row = await createProfile({
    workspace_id: workspaceId,
    name: p.name.slice(0, 100),
    notes: p.notes ?? null,
    tags: p.tags ?? [],
    platform: p.platform ?? null
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

// Vendor/CSV import: N parsed records → N new profiles. Sequential inserts so
// the profile_number trigger and RLS evaluate row-by-row; per-row failures
// don't abort the batch.
export async function importForeignFile(file: File, workspaceId: string): Promise<ImportSummary> {
  const text = await file.text()
  const parsed = parseForeignProfiles(file.name, text)
  const summary: ImportSummary = { created: 0, failed: 0, errors: [] }
  for (const p of parsed) {
    try {
      await createFromParsed(p, workspaceId)
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
  const row = await createProfile({ workspace_id: workspaceId, name, tags: ['imported'] })
  await updateProfile(row.id, { cookies_json: json })
  return { name, count }
}
