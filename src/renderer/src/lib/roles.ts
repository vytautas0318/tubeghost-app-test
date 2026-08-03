// Supabase roles data layer.
// All mutations are gated by RLS — see migration 0002_full_schema.sql:
//   roles.view / roles.create plan-gated / roles.edit / roles.delete
//   role_permissions readable with roles.view / role_permissions insert / delete
//
// This module deliberately does NOT call can_user_modify_role(): the RLS
// policy already enforces it. The renderer uses caller's hierarchy
// (loaded from app_roles + the user's role assignment) for UX gating only.

import { getSupabase, type GhostClient } from '@/lib/supabase'

export interface AppRoleRow {
  id: string
  workspace_id: string
  name: string
  description: string | null
  color: string | null
  hierarchy: number
  is_protected: boolean
  is_delete_protected: boolean
  is_default: boolean
  created_at: string
}

export interface AppPermissionRow {
  permission_key: string
  category: string
  label: string
  description: string | null
}

export interface RolePermissionRow {
  role_id: string
  permission_key: string
}

export const PRESET_ROLE_COLORS = [
  '#E60000', // brand red
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#6366F1', // indigo (schema default)
  '#A855F7', // purple
  '#EC4899', // pink
  '#64748B' // slate
]

// Order categories appear in the permission grid. Matches the seeded
// app_permissions categories from migration 0002.
export const CATEGORY_ORDER = [
  'profiles',
  'groups',
  'tags',
  'bulk',
  'workspace',
  'billing',
  'members',
  'roles',
  'extensions',
  'activity'
]

function client(): GhostClient {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

export async function listRoles(workspaceId: string): Promise<AppRoleRow[]> {
  const { data, error } = await client()
    .from('app_roles')
    .select(
      'id, workspace_id, name, description, color, hierarchy, is_protected, is_delete_protected, is_default, created_at'
    )
    .eq('workspace_id', workspaceId)
    .order('hierarchy', { ascending: true })
  if (error) throw error
  return (data ?? []) as AppRoleRow[]
}

export async function listAppPermissions(): Promise<AppPermissionRow[]> {
  const { data, error } = await client()
    .from('app_permissions')
    .select('permission_key, category, label, description')
    .order('category', { ascending: true })
    .order('permission_key', { ascending: true })
  if (error) throw error
  return (data ?? []) as AppPermissionRow[]
}

export async function listRolePermissions(workspaceId: string): Promise<RolePermissionRow[]> {
  const { data, error } = await client()
    .from('role_permissions')
    .select('role_id, permission_key')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  return (data ?? []) as RolePermissionRow[]
}

export interface NewRoleInput {
  workspace_id: string
  name: string
  description?: string | null
  color?: string | null
  hierarchy: number
}

export async function createRole(input: NewRoleInput): Promise<AppRoleRow> {
  const { data, error } = await client()
    .from('app_roles')
    .insert({
      workspace_id: input.workspace_id,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? '#6366f1',
      hierarchy: input.hierarchy,
      is_protected: false,
      is_delete_protected: false,
      is_default: false
    })
    .select(
      'id, workspace_id, name, description, color, hierarchy, is_protected, is_delete_protected, is_default, created_at'
    )
    .single()
  if (error) throw error
  return data as AppRoleRow
}

export async function updateRole(
  roleId: string,
  patch: Partial<Pick<AppRoleRow, 'name' | 'description' | 'color' | 'hierarchy'>>
): Promise<AppRoleRow> {
  const { data, error } = await client()
    .from('app_roles')
    .update(patch)
    .eq('id', roleId)
    .select(
      'id, workspace_id, name, description, color, hierarchy, is_protected, is_delete_protected, is_default, created_at'
    )
    .single()
  if (error) throw error
  return data as AppRoleRow
}

export async function deleteRole(roleId: string): Promise<void> {
  const { error } = await client().from('app_roles').delete().eq('id', roleId)
  if (error) throw error
}

export async function addRolePermission(
  workspaceId: string,
  roleId: string,
  permissionKey: string
): Promise<void> {
  const { error } = await client().from('role_permissions').insert({
    role_id: roleId,
    workspace_id: workspaceId,
    permission_key: permissionKey
  })
  // 23505 = unique_violation: already granted. Treat as success (idempotent).
  if (error && (error as { code?: string }).code !== '23505') throw error
}

export async function removeRolePermission(roleId: string, permissionKey: string): Promise<void> {
  const { error } = await client()
    .from('role_permissions')
    .delete()
    .eq('role_id', roleId)
    .eq('permission_key', permissionKey)
  if (error) throw error
}

// Member count per role in a workspace, in one round-trip. Used by the
// Roles & access left panel meta line. Returns Map<roleId, count>.
export async function listRoleMemberCounts(workspaceId: string): Promise<Map<string, number>> {
  const { data, error } = await client()
    .from('user_roles')
    .select('role_id')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  const counts = new Map<string, number>()
  for (const r of (data ?? []) as Array<{ role_id: string }>) {
    counts.set(r.role_id, (counts.get(r.role_id) ?? 0) + 1)
  }
  return counts
}

// Count members holding a given role. Used by the delete-confirmation modal.
export async function countMembersWithRole(roleId: string): Promise<number> {
  const { count, error } = await client()
    .from('user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('role_id', roleId)
  if (error) throw error
  return count ?? 0
}
