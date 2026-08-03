// MemberService — Supabase data layer for workspace-member lifecycle:
// status (enable/disable), role assignment, removal, and presence.
//
// All writes are gated by RLS (see 0002_full_schema.sql + 0014_members_invitations.sql):
//   members.assign_role → user_roles upsert
//   members.remove      → workspace_members delete (or soft status='removed')
//   members.disable     → workspace_members status update
// This module is a thin typed wrapper; RLS is the source of truth. Mirrors the
// error-classification style already used inline in pages/members/useMembersData.

import { getSupabase, type GhostClient } from '@/lib/supabase'

export type MemberStatus = 'pending' | 'active' | 'disabled' | 'removed'

export interface WorkspaceMemberRow {
  workspace_id: string
  user_id: string
  invited_by: string | null
  status: MemberStatus
  joined_at: string | null
  last_seen_at: string | null
  created_at: string | null
  updated_at: string | null
}

export type MemberFailure =
  | { ok: false; reason: 'permission'; message?: string }
  | { ok: false; reason: 'unknown'; message?: string }

export type MemberResult = { ok: true } | MemberFailure

function client(): GhostClient {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

function classify(err: { code?: string; message: string }): MemberFailure {
  if (err.code === '42501' || /permission|denied|policy/i.test(err.message)) {
    return { ok: false, reason: 'permission' }
  }
  return { ok: false, reason: 'unknown', message: err.message }
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getMembers(workspaceId: string): Promise<WorkspaceMemberRow[]> {
  const { data, error } = await client()
    .from('workspace_members')
    .select(
      'workspace_id, user_id, invited_by, status, joined_at, last_seen_at, created_at, updated_at'
    )
    .eq('workspace_id', workspaceId)
  if (error) throw error
  return (data ?? []) as WorkspaceMemberRow[]
}

// ── Status ───────────────────────────────────────────────────────────────────

async function setStatus(
  workspaceId: string,
  userId: string,
  status: MemberStatus
): Promise<MemberResult> {
  const { error } = await client()
    .from('workspace_members')
    .update({ status })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
  if (error) return classify(error)
  return { ok: true }
}

export function disableMember(workspaceId: string, userId: string): Promise<MemberResult> {
  return setStatus(workspaceId, userId, 'disabled')
}

export function enableMember(workspaceId: string, userId: string): Promise<MemberResult> {
  return setStatus(workspaceId, userId, 'active')
}

// Generic member-info update (extensible: status today; display fields later
// once we own a member-profile table). Only whitelisted columns are sent.
export async function updateMember(
  workspaceId: string,
  userId: string,
  patch: { status?: MemberStatus }
): Promise<MemberResult> {
  const update: Record<string, unknown> = {}
  if (patch.status) update.status = patch.status
  if (Object.keys(update).length === 0) return { ok: true }
  const { error } = await client()
    .from('workspace_members')
    .update(update)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
  if (error) return classify(error)
  return { ok: true }
}

// ── Role ───────────────────────────────────────────────────────────────────

export async function changeRole(
  workspaceId: string,
  userId: string,
  newRoleId: string,
  callerUid: string
): Promise<MemberResult> {
  const { error } = await client()
    .from('user_roles')
    .upsert(
      { user_id: userId, role_id: newRoleId, workspace_id: workspaceId, assigned_by: callerUid },
      { onConflict: 'user_id,workspace_id' }
    )
  if (error) return classify(error)
  return { ok: true }
}

// ── Removal ──────────────────────────────────────────────────────────────────
// Phase-1 spec: "Transfer resources (placeholder) → Delete member. Never
// automatically delete resources." We hard-delete the membership row (RLS
// members.remove); profiles/proxies (created_by) are intentionally left intact.

export async function removeMember(workspaceId: string, userId: string): Promise<MemberResult> {
  const { error } = await client()
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
  if (error) return classify(error)
  return { ok: true }
}

// ── Presence ─────────────────────────────────────────────────────────────────

// Best-effort heartbeat; failures are swallowed (presence is non-critical).
export async function touchLastSeen(workspaceId: string): Promise<void> {
  const c = getSupabase()
  if (!c) return
  await c.rpc('touch_member_last_seen', { p_workspace_id: workspaceId }).then(
    () => undefined,
    () => undefined
  )
}
