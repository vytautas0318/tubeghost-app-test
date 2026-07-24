// Supabase workspace-tags data layer (migration 0019). A tag is a
// (workspace_id, name, color) row; profiles.tags / authenticator_tokens.tags
// still reference tags by NAME, and the stored color here is the source of
// truth for how a tag chip is painted. Names absent from this table fall back
// to the legacy name-hash in tagColor() so old arrays keep rendering.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'

export interface TagRow {
  id: string
  workspace_id: string
  name: string
  color: string
  created_by: string | null
  created_at: string
}

// Preset swatches for the tag color picker (mirrors lib/groups.ts PRESET_COLORS
// so the two color pickers look identical). Neutral grey is included for
// low-emphasis tags like "official".
export const TAG_PRESET_COLORS = [
  '#E60000', // red
  '#F59E0B', // amber
  '#EAB308', // yellow
  '#10B981', // green
  '#14B8A6', // teal
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#6B7280' // neutral
] as const

export const DEFAULT_TAG_COLOR = TAG_PRESET_COLORS[5] // blue

function client(): SupabaseClient {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

export async function listTags(workspaceId: string): Promise<TagRow[]> {
  const { data, error } = await client()
    .from('tags')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as TagRow[]
}

// Create a tag with a chosen color. If the name already exists in the
// workspace (case-insensitive), returns the existing row instead of erroring —
// creating "the same tag" twice is a no-op the UI can treat as success.
export async function createTag(workspaceId: string, name: string, color: string): Promise<TagRow> {
  const trimmed = name.trim()
  const { data, error } = await client()
    .from('tags')
    .insert({ workspace_id: workspaceId, name: trimmed, color })
    .select('*')
    .single()
  if (error) {
    // Unique-violation → fetch and return the existing tag.
    if (error.code === '23505') {
      const { data: existing } = await client()
        .from('tags')
        .select('*')
        .eq('workspace_id', workspaceId)
        .ilike('name', trimmed)
        .limit(1)
      if (existing && existing[0]) return existing[0] as TagRow
    }
    throw error
  }
  return data as TagRow
}

// Edit a tag's name and/or color. Routed through the rename_tag RPC (migration
// 0023) so a NAME change cascades into every profiles.tags / authenticator_
// tokens.tags array that references the old name — those columns store tags by
// name, so a plain UPDATE of the registry row would orphan the old name.
export async function updateTag(id: string, patch: { name: string; color: string }): Promise<void> {
  const { error } = await client().rpc('rename_tag', {
    p_tag_id: id,
    p_new_name: patch.name.trim(),
    p_new_color: patch.color
  })
  if (error) throw error
}

// Delete a tag. Routed through the delete_tag RPC (migration 0029) so the tag's
// NAME is also removed from every profiles.tags / authenticator_tokens.tags
// array in the workspace — those columns store tags by name, so a bare delete
// of the registry row would leave the name orphaned as a chip on profiles.
export async function deleteTag(id: string): Promise<void> {
  const { error } = await client().rpc('delete_tag', { p_tag_id: id })
  if (error) throw error
}

// ── Color resolution (shared by Profiles + Authenticator) ─────────────────
// Legacy fallback palette — matches the old tagTone/authData behavior so tags
// created before 0019 (not yet in the tags table) still get a stable color.
const LEGACY_HASH_PALETTE = ['#E60000', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#6B7280']

export function legacyTagColor(name: string): string {
  const key = name.trim().toLowerCase()
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return LEGACY_HASH_PALETTE[h % LEGACY_HASH_PALETTE.length]
}

// Build a name→color lookup from a loaded tag list. Case-insensitive; falls
// back to the legacy hash for names not in the registry.
export function makeTagColorMap(tags: TagRow[]): (name: string) => string {
  const byName = new Map(tags.map((t) => [t.name.trim().toLowerCase(), t.color]))
  return (name: string) => byName.get(name.trim().toLowerCase()) ?? legacyTagColor(name)
}
