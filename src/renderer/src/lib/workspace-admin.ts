// Danger-zone workspace operations. Each maps to a SECURITY DEFINER RPC that
// re-checks permission server-side (0025_settings.sql) — the UI gate is UX only.

import { getSupabase } from '@/lib/supabase'

function rpc(): NonNullable<ReturnType<typeof getSupabase>> {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured')
  return c
}

// Wipe stored login state across every profile in the workspace. Requires
// workspace.edit_settings (enforced inside the RPC).
export async function wipeWorkspaceCookies(workspaceId: string): Promise<void> {
  const { error } = await rpc().rpc('wipe_workspace_cookies', { p_workspace_id: workspaceId })
  if (error) throw error
}

// Remove yourself from the workspace. Owners are rejected server-side.
export async function leaveWorkspace(workspaceId: string): Promise<void> {
  const { error } = await rpc().rpc('leave_workspace', { p_workspace_id: workspaceId })
  if (error) throw error
}

// Permanently delete the workspace and cascade all children. Owner-only
// (workspace.delete), enforced inside the RPC.
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const { error } = await rpc().rpc('delete_workspace', { p_workspace_id: workspaceId })
  if (error) throw error
}
