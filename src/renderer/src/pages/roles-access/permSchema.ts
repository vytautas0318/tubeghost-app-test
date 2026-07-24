// Permission matrix schema for the Roles & access page (from the TubeGhost
// design). Visual/preview data — this page's toggles are local state and do NOT
// affect real RBAC (see RolesLegacy.tsx for the DB-backed role editor).

export type PermType = 'level' | 'toggle'
export type Level = 'none' | 'read' | 'write' | 'full'
export type PermVal = boolean | Level
export type Tone = 'red' | 'violet' | 'green' | 'blue' | 'neutral'

export interface PermRow {
  key: string
  name: string
  desc: string
  type: PermType
}
export interface PermGroup {
  group: string
  icon: string
  rows: PermRow[]
}
export interface RoleDef {
  id: string
  name: string
  members: number
  tone: Tone
  desc: string
}

export const ROLE_LIST: RoleDef[] = [
  { id: 'owner', name: 'Owner', members: 1, tone: 'red', desc: 'Full, unrestricted access to everything in the workspace.' },
  { id: 'admin', name: 'Admin', members: 1, tone: 'violet', desc: 'Manage the workspace, team, and billing — everything except deleting the workspace.' },
  { id: 'editor', name: 'Editor', members: 2, tone: 'green', desc: 'Launch and manage assigned profiles. No billing or team control.' },
  { id: 'uploader', name: 'Uploader', members: 1, tone: 'blue', desc: 'Upload and run assigned profiles. Read-only on settings.' },
  { id: 'viewer', name: 'Viewer', members: 1, tone: 'neutral', desc: 'Read-only access across the workspace.' }
]

export const PERM_SCHEMA: PermGroup[] = [
  {
    group: 'Profiles',
    icon: 'profiles',
    rows: [
      { key: 'profiles_manage', name: 'Browser profiles', desc: 'View, create, edit, and launch profiles', type: 'level' },
      { key: 'profiles_assign', name: 'Profile assignment', desc: 'Reassign profiles between members', type: 'level' },
      { key: 'fingerprint_edit', name: 'Fingerprint editing', desc: 'Modify OS, WebGL, canvas, and hardware fingerprints', type: 'level' },
      { key: 'profiles_delete', name: 'Delete profiles', desc: 'Permanently remove profiles and their cookies', type: 'toggle' },
      { key: 'profiles_bulk', name: 'Bulk actions', desc: 'Bulk launch, move, tag, and delete in one go', type: 'toggle' }
    ]
  },
  {
    group: 'Accounts & cookies',
    icon: 'accounts',
    rows: [
      { key: 'accounts_view', name: 'Account logins', desc: 'View and autofill stored account credentials', type: 'level' },
      { key: 'cookies_import', name: 'Import cookies', desc: 'Load cookies & sessions into a profile', type: 'toggle' },
      { key: 'cookies_export', name: 'Export cookies & sessions', desc: 'Download stored login state out of a profile', type: 'toggle' },
      { key: 'sessions_sync', name: 'Sync browser sessions', desc: 'Snapshot, restore, and download encrypted sessions across devices', type: 'toggle' }
    ]
  },
  {
    group: 'Authenticator (2FA)',
    icon: 'shield',
    rows: [
      { key: 'auth_codes', name: 'Generate 2FA codes', desc: 'View and copy live codes for assigned accounts', type: 'level' },
      { key: 'auth_add', name: 'Add & remove tokens', desc: 'Enroll new accounts or delete authenticator tokens', type: 'toggle' },
      { key: 'auth_seed', name: 'Reveal setup keys', desc: 'See the raw TOTP secret behind a token', type: 'toggle' },
      { key: 'auth_export', name: 'Export tokens', desc: 'Migrate or download seeds out of the workspace', type: 'toggle' }
    ]
  },
  {
    group: 'Proxies',
    icon: 'proxies',
    rows: [
      { key: 'proxy_pool', name: 'Proxy pool', desc: 'View and assign proxies to profiles', type: 'level' },
      { key: 'proxy_manage', name: 'Add & remove proxies', desc: 'Import new proxies or delete from the pool', type: 'level' },
      { key: 'proxy_creds', name: 'View proxy credentials', desc: 'See full IP, port, username, and password', type: 'toggle' },
      { key: 'proxy_test', name: 'Test proxies', desc: 'Run reachability and latency checks', type: 'toggle' }
    ]
  },
  {
    group: 'Automation',
    icon: 'automation',
    rows: [
      { key: 'automation_build', name: 'Automations', desc: 'Build and run no-code flows inside profiles', type: 'level' },
      { key: 'synchronizer', name: 'Synchronizer', desc: 'Run synchronized multi-profile sessions', type: 'toggle' },
      { key: 'api_access', name: 'API & AI MCP', desc: 'Generate API keys and connect AI agents', type: 'toggle' },
      { key: 'extensions', name: 'Extensions', desc: 'Install and sync browser extensions', type: 'level' }
    ]
  },
  {
    group: 'Team & workspace',
    icon: 'members',
    rows: [
      { key: 'members_manage', name: 'Manage members', desc: 'Invite, remove, and change member roles', type: 'toggle' },
      { key: 'roles_manage', name: 'Manage roles & permissions', desc: 'Create roles and edit this permission matrix', type: 'toggle' },
      { key: 'billing', name: 'Billing & subscription', desc: 'View invoices and manage the plan', type: 'toggle' },
      { key: 'audit', name: 'Activity & audit log', desc: 'View who did what across the workspace', type: 'toggle' },
      { key: 'data_export', name: 'Export workspace data', desc: 'Bulk export profiles, cookies, and proxies', type: 'toggle' },
      { key: 'workspace_settings', name: 'Workspace settings', desc: 'Edit defaults, security, and the danger zone', type: 'toggle' }
    ]
  }
]

const ROLE_PRESETS: Record<string, Record<string, PermVal>> = {
  admin: {
    profiles_manage: 'full', profiles_assign: 'full', fingerprint_edit: 'full', profiles_delete: true, profiles_bulk: true,
    accounts_view: 'full', cookies_import: true, cookies_export: true, sessions_sync: false,
    auth_codes: 'full', auth_add: true, auth_seed: true, auth_export: true,
    proxy_pool: 'full', proxy_manage: 'full', proxy_creds: true, proxy_test: true,
    automation_build: 'full', synchronizer: true, api_access: true, extensions: 'full',
    members_manage: true, roles_manage: true, billing: true, audit: true, data_export: true, workspace_settings: true
  },
  editor: {
    profiles_manage: 'write', profiles_assign: 'none', fingerprint_edit: 'read', profiles_delete: false, profiles_bulk: true,
    accounts_view: 'read', cookies_import: true, cookies_export: false,
    auth_codes: 'write', auth_add: true, auth_seed: false, auth_export: false,
    proxy_pool: 'read', proxy_manage: 'none', proxy_creds: true, proxy_test: true,
    automation_build: 'write', synchronizer: true, api_access: false, extensions: 'read',
    members_manage: false, roles_manage: false, billing: false, audit: true, data_export: false, workspace_settings: false
  },
  uploader: {
    profiles_manage: 'read', profiles_assign: 'none', fingerprint_edit: 'none', profiles_delete: false, profiles_bulk: false,
    accounts_view: 'read', cookies_import: false, cookies_export: false,
    auth_codes: 'read', auth_add: false, auth_seed: false, auth_export: false,
    proxy_pool: 'read', proxy_manage: 'none', proxy_creds: false, proxy_test: false,
    automation_build: 'read', synchronizer: false, api_access: false, extensions: 'none',
    members_manage: false, roles_manage: false, billing: false, audit: false, data_export: false, workspace_settings: false
  },
  viewer: {
    profiles_manage: 'read', accounts_view: 'read', auth_codes: 'read', proxy_pool: 'read', automation_build: 'read', extensions: 'read', audit: true
  }
}

export function valFor(roleId: string, key: string, type: PermType): PermVal {
  if (roleId === 'owner') return type === 'toggle' ? true : 'full'
  const p = ROLE_PRESETS[roleId] ?? {}
  if (key in p) return p[key]
  return type === 'toggle' ? false : 'none'
}

export function seedRole(roleId: string): Record<string, PermVal> {
  const o: Record<string, PermVal> = {}
  for (const g of PERM_SCHEMA) for (const row of g.rows) o[row.key] = valFor(roleId, row.key, row.type)
  return o
}
