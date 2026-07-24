// Bridge between the Roles & access UI catalogue (permSchema.ts) and the
// real Supabase RBAC, whose role_permissions table stores a *set of boolean
// permission_keys* — there is no "level" column.
//
// A `level` control is expressed as an ordered ladder of DB keys:
//   none  → grant none of the ladder keys
//   read  → grant the read tier
//   write → grant read + write tiers
//   full  → grant read + write + full tiers
// The stored level of a role is DERIVED from which ladder keys it holds
// (levelFromKeys), and saving a level writes exactly keysForLevel (adding the
// selected tiers, removing the rest of the ladder).
//
// A `toggle` control maps to one or more DB keys, all granted/revoked together.
//
// This file and migration 0017 MUST agree on every key. Keys that have no
// table/RLS yet (accounts.*, twofa.*, cookies.*, automations.*, synchronizer,
// api.manage) still live in app_permissions and are enforced the moment their
// feature ships — permissions are the API (CLAUDE.md).

import type { Level, PermType } from './permSchema'

export const LEVEL_ORDER: Level[] = ['none', 'read', 'write', 'full']

export function levelRank(l: Level): number {
  return LEVEL_ORDER.indexOf(l)
}

// A level ladder: the DB keys granted at each tier ABOVE the previous.
// read holds `read`; write holds read+write; full holds read+write+full.
interface LevelLadder {
  type: 'level'
  read: string[]
  write: string[]
  full: string[]
}
interface ToggleMap {
  type: 'toggle'
  keys: string[]
}
export type CatalogMapEntry = LevelLadder | ToggleMap

// Keyed by permSchema.ts catalogue `key`.
export const PERM_MAP: Record<string, CatalogMapEntry> = {
  // ── Profiles ──────────────────────────────────────────────────────────
  profiles_manage: {
    type: 'level',
    read: ['profiles.view', 'profiles.launch'],
    write: ['profiles.create', 'profiles.edit'],
    full: ['profiles.delete', 'profiles.force_unlock']
  },
  profiles_assign: {
    type: 'level',
    read: ['profiles.view'],
    write: ['profiles.assign_member'],
    full: []
  },
  fingerprint_edit: {
    type: 'level',
    read: ['profiles.view'],
    write: ['profiles.edit_fingerprint'],
    full: []
  },
  profiles_delete: { type: 'toggle', keys: ['profiles.delete'] },
  profiles_bulk: {
    type: 'toggle',
    keys: ['bulk.create_profiles', 'bulk.edit_profiles', 'bulk.delete_profiles']
  },

  // ── Accounts & cookies ────────────────────────────────────────────────
  accounts_view: {
    type: 'level',
    read: ['accounts.view'],
    write: ['accounts.autofill'],
    full: ['accounts.manage']
  },
  cookies_import: { type: 'toggle', keys: ['cookies.import'] },
  cookies_export: { type: 'toggle', keys: ['cookies.export'] },
  sessions_sync: { type: 'toggle', keys: ['sessions.sync'] },

  // ── Authenticator (2FA) ───────────────────────────────────────────────
  auth_codes: {
    type: 'level',
    read: ['twofa.view'],
    write: ['twofa.generate'],
    full: []
  },
  auth_add: { type: 'toggle', keys: ['twofa.manage_tokens'] },
  auth_seed: { type: 'toggle', keys: ['twofa.reveal_seed'] },
  auth_export: { type: 'toggle', keys: ['twofa.export'] },

  // ── Proxies ───────────────────────────────────────────────────────────
  proxy_pool: {
    type: 'level',
    read: ['proxies.view'],
    write: ['proxies.assign'],
    full: []
  },
  proxy_manage: {
    type: 'level',
    read: ['proxies.view'],
    write: ['proxies.create'],
    full: ['proxies.delete']
  },
  proxy_creds: { type: 'toggle', keys: ['proxies.view_credentials'] },
  proxy_test: { type: 'toggle', keys: ['proxies.test'] },

  // ── Automation ────────────────────────────────────────────────────────
  automation_build: {
    type: 'level',
    read: ['automations.view'],
    write: ['automations.edit'],
    full: ['automations.run']
  },
  synchronizer: { type: 'toggle', keys: ['synchronizer.run'] },
  api_access: { type: 'toggle', keys: ['api.manage'] },
  extensions: {
    type: 'level',
    read: ['profiles.view'],
    write: ['extensions.create', 'extensions.edit'],
    full: ['extensions.delete']
  },

  // ── Team & workspace ──────────────────────────────────────────────────
  members_manage: {
    type: 'toggle',
    keys: ['members.invite', 'members.remove', 'members.assign_role']
  },
  roles_manage: { type: 'toggle', keys: ['roles.create', 'roles.edit', 'roles.delete'] },
  billing: { type: 'toggle', keys: ['billing.view', 'billing.manage'] },
  audit: { type: 'toggle', keys: ['activity.view'] },
  data_export: { type: 'toggle', keys: ['workspace.export_data'] },
  workspace_settings: { type: 'toggle', keys: ['workspace.edit_settings'] }
}

// All DB keys a catalogue row can possibly own (used to know what to clear
// when writing a new value, and to detect whether a row's keys are held).
export function ladderKeys(entry: CatalogMapEntry): string[] {
  return entry.type === 'toggle' ? entry.keys : [...entry.read, ...entry.write, ...entry.full]
}

// Given the DB keys a role holds, derive the level shown for a level row.
// A tier counts as "held" only if EVERY key in that tier is present, so a
// partially-granted ladder degrades to the highest fully-satisfied tier.
export function levelFromKeys(entry: LevelLadder, held: Set<string>): Level {
  const has = (ks: string[]): boolean => ks.length === 0 || ks.every((k) => held.has(k))
  if (has(entry.read) && has(entry.write) && has(entry.full)) return 'full'
  if (has(entry.read) && has(entry.write)) return 'write'
  if (has(entry.read)) return 'read'
  return 'none'
}

// The exact set of ladder keys a level should hold.
export function keysForLevel(entry: LevelLadder, level: Level): string[] {
  switch (level) {
    case 'full':
      return [...entry.read, ...entry.write, ...entry.full]
    case 'write':
      return [...entry.read, ...entry.write]
    case 'read':
      return [...entry.read]
    default:
      return []
  }
}

// Whether a toggle row is on = every one of its keys is held.
export function toggleFromKeys(entry: ToggleMap, held: Set<string>): boolean {
  return entry.keys.length > 0 && entry.keys.every((k) => held.has(k))
}

// Translate a whole role's held DB keys into catalogue-shaped values.
import type { PermVal } from './permSchema'
export function keysToCatalog(
  held: Set<string>,
  rows: Array<{ key: string; type: PermType }>
): Record<string, PermVal> {
  const out: Record<string, PermVal> = {}
  for (const row of rows) {
    const entry = PERM_MAP[row.key]
    if (!entry) {
      out[row.key] = row.type === 'toggle' ? false : 'none'
      continue
    }
    out[row.key] =
      entry.type === 'toggle' ? toggleFromKeys(entry, held) : levelFromKeys(entry, held)
  }
  return out
}

// Compute the DB-key delta needed to move a single catalogue row to `val`.
// Returns keys to grant and keys to revoke (scoped to that row's ladder).
export function diffForRow(rowKey: string, val: PermVal): { grant: string[]; revoke: string[] } {
  const entry = PERM_MAP[rowKey]
  if (!entry) return { grant: [], revoke: [] }
  if (entry.type === 'toggle') {
    return val ? { grant: entry.keys, revoke: [] } : { grant: [], revoke: entry.keys }
  }
  const want = new Set(keysForLevel(entry, val as Level))
  const all = ladderKeys(entry)
  return {
    grant: all.filter((k) => want.has(k)),
    revoke: all.filter((k) => !want.has(k))
  }
}
