// Supabase groups data layer.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'

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

function client(): SupabaseClient {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
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

export async function countProfilesInGroup(
  workspaceId: string,
  groupId: string
): Promise<number> {
  const { count, error } = await client()
    .from('profiles')
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
export async function assignProfileGroup(
  profileId: string,
  groupId: string | null
): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .update({ group_id: groupId })
    .eq('id', profileId)
  if (error) throw error
}
