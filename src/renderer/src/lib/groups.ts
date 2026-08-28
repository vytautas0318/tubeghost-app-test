// Supabase groups data layer.

import { getSupabase, type GhostClient } from '@/lib/supabase'

export interface GroupRow {
  id: string
  workspace_id: string
  name: string
  color: string
  created_at: string
}

export const PRESET_COLORS = [
  '#E60000',
  '#F59E0B',
  '#EAB308',
  '#10B981',
  '#14B8A6',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899'
] as const

export const DEFAULT_GROUP_COLOR = PRESET_COLORS[5] // blue

function client(): GhostClient {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

export async function listGroups(workspaceId: string): Promise<GroupRow[]> {
  const { data, error } = await client()
    .from('groups')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as GroupRow[]
}

export async function countProfilesInGroup(workspaceId: string, groupId: string): Promise<number> {
  const { count, error } = await client()
    .from('browser_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('group_id', groupId)
  if (error) throw error
  return count ?? 0
}

export async function createGroup(
  workspaceId: string,
  name: string,
  color: string
): Promise<GroupRow> {
  const { data, error } = await client()
    .from('groups')
    .insert({ workspace_id: workspaceId, name, color })
    .select('*')
    .single()
  if (error) throw error
  return data as GroupRow
}

export async function updateGroup(
  id: string,
  patch: Partial<Pick<GroupRow, 'name' | 'color'>>
): Promise<GroupRow> {
  const { data, error } = await client()
    .from('groups')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as GroupRow
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await client().from('groups').delete().eq('id', id)
  if (error) throw error
}

// Move a profile into a group (or out of all groups if groupId=null).
export async function assignProfileGroup(profileId: string, groupId: string | null): Promise<void> {
  const { error } = await client()
    .from('browser_profiles')
    .update({ group_id: groupId })
    .eq('id', profileId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Group access grants (profile access by group — migration 0023).
//
// A grant says "this USER may reach the profiles in this GROUP". Role decides
// WHAT you may do; the grant decides WHICH profiles it applies to.
//
// Only bites while the workspace's restrict_profiles_by_group toggle is on.
// With it off, every member sees every profile exactly as before.
//
// Note ungrouped profiles: when the toggle is ON they are ADMIN-ONLY. A profile
// must be in a group to be shared, so a grant can never reach an ungrouped one.
// RLS is the real boundary; these helpers only manage the rows.

export interface GroupAccessRow {
  id: string
  workspace_id: string
  group_id: string
  user_id: string
  created_at: string
}

export async function listGroupAccess(workspaceId: string): Promise<GroupAccessRow[]> {
  const { data, error } = await client()
    .from('profile_group_access')
    .select('*')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  return (data ?? []) as GroupAccessRow[]
}

export async function grantGroupAccess(
  workspaceId: string,
  groupId: string,
  userId: string
): Promise<void> {
  // Upsert on (group_id, user_id): re-granting is a no-op rather than a unique
  // violation, so a double-click can't surface as an error.
  const { error } = await client()
    .from('profile_group_access')
    .upsert(
      { workspace_id: workspaceId, group_id: groupId, user_id: userId },
      { onConflict: 'group_id,user_id' }
    )
  if (error) throw error
}

export async function revokeGroupAccess(groupId: string, userId: string): Promise<void> {
  const { error } = await client()
    .from('profile_group_access')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function isGroupRestrictionEnabled(workspaceId: string): Promise<boolean> {
  const { data, error } = await client()
    .from('workspaces')
    .select('restrict_profiles_by_group')
    .eq('id', workspaceId)
    .maybeSingle()
  if (error) return false
  return Boolean(
    (data as { restrict_profiles_by_group?: boolean } | null)?.restrict_profiles_by_group
  )
}

export async function setGroupRestriction(workspaceId: string, on: boolean): Promise<void> {
  const { error } = await client()
    .from('workspaces')
    .update({ restrict_profiles_by_group: on })
    .eq('id', workspaceId)
  if (error) throw error
}
