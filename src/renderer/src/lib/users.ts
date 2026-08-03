// Supabase user-details data layer.
// Resolves auth.users data (email, display name, avatar) for members of
// workspaces the caller belongs to. Backed by the get_workspace_user_details
// SECURITY DEFINER RPC — see supabase/migrations/0004_user_details.sql.

import { getSupabase, type GhostClient } from '@/lib/supabase'
import type { AvatarConfig } from '@/lib/avatar'

export interface WorkspaceUserDetails {
  user_id: string
  email: string
  display_name: string
  avatar_url: string | null
  // The member's composable ghost-avatar config (see lib/avatar.ts). Null if
  // the member never customized theirs; may be a partial/legacy blob, so
  // consumers should normalize via avatarConfigFrom().
  avatar_config: Partial<AvatarConfig> | null
}

function client(): GhostClient {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

// Returns details for every member of the given workspace. Caller must
// be a member (enforced server-side); otherwise returns an empty list.
export async function listWorkspaceUserDetails(
  workspaceId: string
): Promise<WorkspaceUserDetails[]> {
  const { data, error } = await client().rpc('get_workspace_user_details', {
    p_workspace_id: workspaceId
  })
  if (error) throw error
  return (data as WorkspaceUserDetails[] | null) ?? []
}

// Convenience: fetch as a Map keyed by user_id, for O(1) lookup when
// rendering tables (Members page) or single-user lookups (Settings → Owner).
export async function getWorkspaceUserDetailsMap(
  workspaceId: string
): Promise<Map<string, WorkspaceUserDetails>> {
  const list = await listWorkspaceUserDetails(workspaceId)
  return new Map(list.map((u) => [u.user_id, u]))
}
