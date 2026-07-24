// Frontend permission + plan-feature helpers. Always pair with RLS —
// these are UX gates, not security. RLS is the source of truth.
//
// Pattern:
//   const canCreate = useHasPermission('profiles.create')
//   const bulkAvailable = useFeatureEnabled('bulk')
//   {canCreate && bulkAvailable && <BulkButton />}
//
// Preview mode: when active, useHasPermission / useHasAnyPermission read
// from the previewed role's snapshot instead of the caller's real perms.
// useFeatureEnabled is NOT swapped — plan features are workspace-scoped,
// not role-scoped. RLS still uses the real auth.uid() for writes.

import { useWorkspace } from '@/store/workspace'

export type PermissionKey =
  | 'profiles.view'
  | 'profiles.create'
  | 'profiles.edit'
  | 'profiles.delete'
  | 'profiles.launch'
  | 'profiles.force_unlock'
  | 'profiles.assign_member'
  | 'profiles.edit_fingerprint'
  | 'groups.view'
  | 'groups.create'
  | 'groups.edit'
  | 'groups.delete'
  | 'tags.create'
  | 'tags.edit'
  | 'tags.delete'
  | 'bulk.create_profiles'
  | 'bulk.edit_profiles'
  | 'bulk.delete_profiles'
  | 'accounts.view'
  | 'accounts.autofill'
  | 'accounts.manage'
  | 'cookies.import'
  | 'cookies.export'
  | 'sessions.sync'
  | 'twofa.view'
  | 'twofa.generate'
  | 'twofa.manage_tokens'
  | 'twofa.reveal_seed'
  | 'twofa.export'
  | 'workspace.view_settings'
  | 'workspace.edit_settings'
  | 'workspace.delete'
  | 'workspace.export_data'
  | 'billing.view'
  | 'billing.manage'
  | 'members.view'
  | 'members.invite'
  | 'members.remove'
  | 'members.assign_role'
  | 'members.disable'
  | 'roles.view'
  | 'roles.create'
  | 'roles.edit'
  | 'roles.delete'
  | 'roles.preview'
  | 'extensions.create'
  | 'extensions.edit'
  | 'extensions.delete'
  | 'automations.view'
  | 'automations.edit'
  | 'automations.run'
  | 'synchronizer.run'
  | 'api.manage'
  | 'proxies.view'
  | 'proxies.create'
  | 'proxies.edit'
  | 'proxies.delete'
  | 'proxies.assign'
  | 'proxies.refresh'
  | 'proxies.test'
  | 'proxies.view_credentials'
  | 'activity.view'

export type FeatureKey =
  | 'realtime_sync'
  | 'bulk'
  | 'extensions'
  | 'tubeproxies_api'
  | 'force_unlock'
  | 'custom_roles'

export function useEffectivePermissions(): string[] {
  const ws = useWorkspace((s) => s.current)
  const preview = useWorkspace((s) => s.preview)
  if (preview.active) return preview.permissions
  return ws?.permissions ?? []
}

export function useHasPermission(key: PermissionKey): boolean {
  const perms = useEffectivePermissions()
  return perms.includes(key)
}

export function useHasAnyPermission(...keys: PermissionKey[]): boolean {
  const perms = useEffectivePermissions()
  return keys.some((k) => perms.includes(k))
}

export function useFeatureEnabled(key: FeatureKey): boolean {
  const ws = useWorkspace((s) => s.current)
  return ws?.features.includes(key) ?? false
}

// Reactive hook so any mutating action can short-circuit during preview.
export function useIsPreview(): boolean {
  return useWorkspace((s) => s.preview.active)
}

// ── Non-hook authorization helper ────────────────────────────────────────
// The canonical `can(perms, key)` for use outside React (event handlers,
// utilities, main-process guards). Pass the acting user's permission list;
// NEVER pass a role name. This is a UX/optimistic gate — the real check is
// RLS's check_user_permission(), which resolves auth.uid() server-side and
// cannot be bypassed by tampering with client state.
export function can(perms: readonly string[], key: PermissionKey): boolean {
  return perms.includes(key)
}

// Level ordering for the Roles & access "level" controls (none<read<write<full).
export type PermLevel = 'none' | 'read' | 'write' | 'full'
const LEVEL_RANK: Record<PermLevel, number> = { none: 0, read: 1, write: 2, full: 3 }

// True if `have` is at least `required` on the none<read<write<full ladder.
export function levelMeets(have: PermLevel, required: PermLevel): boolean {
  return LEVEL_RANK[have] >= LEVEL_RANK[required]
}

// Resolve the current level a permission set expresses for a catalogue key,
// then check it meets the required level. `ladder` maps read/write/full tiers
// to the DB keys that back them (see roles-access/permMap.ts). Kept dependency
// -free here so main-process guards can import it without the renderer schema.
export function canLevel(
  perms: readonly string[],
  ladder: { read: string[]; write: string[]; full: string[] },
  required: PermLevel
): boolean {
  const held = new Set(perms)
  const has = (ks: string[]): boolean => ks.length === 0 || ks.every((k) => held.has(k))
  let have: PermLevel = 'none'
  if (has(ladder.read)) have = 'read'
  if (has(ladder.read) && has(ladder.write)) have = 'write'
  if (has(ladder.read) && has(ladder.write) && has(ladder.full)) have = 'full'
  return levelMeets(have, required)
}
