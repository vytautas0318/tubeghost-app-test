// Supabase extensions data layer.
// Mirrors lib/proxies.ts / lib/groups.ts. RLS enforces every write server-
// side (extensions.create/edit/delete + plan feature); these are the typed
// query wrappers the renderer calls.
//
// The `extensions` row is the cross-device source of truth for metadata +
// assignment. The desktop build unpacked .crx files to disk; the web app
// parses them in-browser (lib/crx.ts) and persists metadata only.

import { getSupabase, type GhostClient } from '@/lib/supabase'

export type ExtSourceType = 'web_store' | 'crx_upload'
export type PermissionScope = 'minimal' | 'limited' | 'broad'
export type AssignMode = 'all' | 'groups' | 'profiles' | 'none'

export interface ExtensionRow {
  id: string
  workspace_id: string
  name: string
  publisher: string | null
  version: string | null
  description: string | null
  source_type: string | null
  source_url: string | null
  web_store_id: string | null
  storage_path: string | null
  icon_data_url: string | null
  category: string | null
  permission_scope: PermissionScope | null
  manifest: Record<string, unknown> | null
  enabled: boolean
  assign_mode: AssignMode
  created_at: string
  updated_at: string
}

// A row plus its resolved assignment targets (join tables).
export interface ExtensionWithAssignment extends ExtensionRow {
  groupIds: string[]
  profileIds: string[]
}

function client(): GhostClient {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

export async function listExtensions(workspaceId: string): Promise<ExtensionWithAssignment[]> {
  const c = client()
  const [exts, profs, grps] = await Promise.all([
    c
      .from('extensions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
    c.from('extension_profiles').select('extension_id, profile_id').eq('workspace_id', workspaceId),
    c.from('extension_groups').select('extension_id, group_id').eq('workspace_id', workspaceId)
  ])
  if (exts.error) throw exts.error
  if (profs.error) throw profs.error
  if (grps.error) throw grps.error

  const byProfile = new Map<string, string[]>()
  for (const r of profs.data ?? []) {
    const arr = byProfile.get(r.extension_id) ?? []
    arr.push(r.profile_id)
    byProfile.set(r.extension_id, arr)
  }
  const byGroup = new Map<string, string[]>()
  for (const r of grps.data ?? []) {
    const arr = byGroup.get(r.extension_id) ?? []
    arr.push(r.group_id)
    byGroup.set(r.extension_id, arr)
  }
  return (exts.data ?? []).map((e) => ({
    ...(e as ExtensionRow),
    profileIds: byProfile.get((e as ExtensionRow).id) ?? [],
    groupIds: byGroup.get((e as ExtensionRow).id) ?? []
  }))
}

// Row fields written after a successful local import (crx or web store).
export interface NewExtensionInput {
  id: string
  workspace_id: string
  name: string
  publisher: string
  version: string
  description: string | null
  source_type: ExtSourceType
  web_store_id: string | null
  icon_data_url: string | null
  category: string
  permission_scope: PermissionScope
  manifest: Record<string, unknown>
}

// Look up an extension the workspace already has. Same add-on = same Web Store
// id, or (for an uploaded .crx, which has no store id) the same name.
export async function findDuplicateExtension(
  workspaceId: string,
  identity: { web_store_id: string | null; name: string }
): Promise<ExtensionRow | null> {
  const c = client()
  let q = c.from('extensions').select('*').eq('workspace_id', workspaceId)
  q = identity.web_store_id
    ? q.eq('web_store_id', identity.web_store_id)
    : q.is('web_store_id', null).eq('name', identity.name)
  const { data, error } = await q.limit(1).maybeSingle()
  if (error) return null
  return (data as ExtensionRow) ?? null
}

export async function createExtension(input: NewExtensionInput): Promise<ExtensionRow> {
  // Refuse a duplicate of an extension the workspace already has. Same add-on =
  // same Web Store id (or same name for an uploaded .crx). Prevents the "same
  // extension installed twice" cards.
  const dup = await findDuplicateExtension(input.workspace_id, {
    web_store_id: input.web_store_id,
    name: input.name
  })
  if (dup) {
    throw new Error(`${input.name} is already installed in this workspace.`)
  }

  const { data, error } = await client()
    .from('extensions')
    .insert({
      id: input.id,
      workspace_id: input.workspace_id,
      name: input.name,
      publisher: input.publisher,
      version: input.version,
      description: input.description,
      source_type: input.source_type,
      source_url: input.web_store_id
        ? `https://chromewebstore.google.com/detail/${input.web_store_id}`
        : null,
      web_store_id: input.web_store_id,
      // storage_path == id. The desktop build used it as the local
      // <userData>/extensions/<id>/ folder name; the web app stores no bytes
      // yet, so it's reserved for a future Supabase Storage object key.
      storage_path: input.id,
      icon_data_url: input.icon_data_url,
      category: input.category,
      permission_scope: input.permission_scope,
      manifest: input.manifest,
      enabled: true,
      assign_mode: 'none'
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ExtensionRow
}

export async function setExtensionEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await client().from('extensions').update({ enabled }).eq('id', id)
  if (error) throw error
}

// Update version/manifest/scope after a "Check for update" pulled a newer
// build. Icon may also change.
export async function updateExtensionFromImport(
  id: string,
  fields: {
    version: string
    permission_scope: PermissionScope
    manifest: Record<string, unknown>
    icon_data_url: string | null
  }
): Promise<void> {
  const { error } = await client().from('extensions').update(fields).eq('id', id)
  if (error) throw error
}

export async function deleteExtension(id: string): Promise<void> {
  // Join-table rows cascade on extension delete (FK on delete cascade).
  const { error } = await client().from('extensions').delete().eq('id', id)
  if (error) throw error
}

// Replace an extension's assignment atomically: set the mode, then rewrite
// the relevant join table. RLS gates each write on extensions.edit.
export async function setExtensionAssignment(
  ext: { id: string; workspace_id: string },
  assignment: { mode: AssignMode; groupIds: string[]; profileIds: string[] }
): Promise<void> {
  const c = client()
  const { error: modeErr } = await c
    .from('extensions')
    .update({ assign_mode: assignment.mode })
    .eq('id', ext.id)
  if (modeErr) throw modeErr

  // Clear both join tables, then re-insert only the active mode's targets.
  await c.from('extension_profiles').delete().eq('extension_id', ext.id)
  await c.from('extension_groups').delete().eq('extension_id', ext.id)

  if (assignment.mode === 'profiles' && assignment.profileIds.length > 0) {
    const rows = assignment.profileIds.map((profile_id) => ({
      extension_id: ext.id,
      profile_id,
      workspace_id: ext.workspace_id
    }))
    const { error } = await c.from('extension_profiles').insert(rows)
    if (error) throw error
  }
  if (assignment.mode === 'groups' && assignment.groupIds.length > 0) {
    const rows = assignment.groupIds.map((group_id) => ({
      extension_id: ext.id,
      group_id,
      workspace_id: ext.workspace_id
    }))
    const { error } = await c.from('extension_groups').insert(rows)
    if (error) throw error
  }
}
