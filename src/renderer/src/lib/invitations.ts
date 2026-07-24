// InvitationService — Supabase data layer for the workspace invitation
// lifecycle. All mutations go through SECURITY DEFINER RPCs defined in
// supabase/migrations/0014_members_invitations.sql, which enforce
// permissions (members.invite) and validation server-side. This module is a
// thin, typed wrapper — RLS + the RPCs are the source of truth, mirroring the
// pattern in lib/roles.ts and lib/users.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export interface InvitationRow {
  id: string
  workspace_id: string
  email: string
  role_id: string
  token: string
  status: InvitationStatus
  message: string | null
  expires_at: string
  created_by: string | null
  accepted_by: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

// Safe projection returned by validate_invitation — never includes the token.
export interface InvitationValidation {
  invitation_id: string
  workspace_id: string
  workspace_name: string
  email: string
  role_id: string
  role_name: string
  status: InvitationStatus
  message: string | null
  expires_at: string
  is_valid: boolean
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .transform((v) => v.toLowerCase())

export const inviteInputSchema = z.object({
  email: emailSchema,
  roleId: z.string().uuid('Pick a role'),
  message: z.string().max(500, 'Message is too long').optional()
})

export type InviteInput = z.input<typeof inviteInputSchema>

function client(): SupabaseClient {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

// Maps a Postgres error to a stable, user-facing reason. Permission failures
// surface as '42501' from the RPCs; validation as 'P0001' / '22023'.
export type InviteFailure =
  | { ok: false; reason: 'permission'; message: string }
  | { ok: false; reason: 'validation'; message: string }
  | { ok: false; reason: 'duplicate'; message: string }
  | { ok: false; reason: 'unknown'; message: string }

function classify(err: { code?: string; message: string }): InviteFailure {
  const msg = err.message
  if (err.code === '42501' || /permission|not authenticated/i.test(msg)) {
    return { ok: false, reason: 'permission', message: msg }
  }
  if (/already (a member|exists)|pending invitation/i.test(msg)) {
    return { ok: false, reason: 'duplicate', message: msg }
  }
  if (
    err.code === '22023' ||
    err.code === 'P0001' ||
    /invalid|not belong|no longer valid/i.test(msg)
  ) {
    return { ok: false, reason: 'validation', message: msg }
  }
  return { ok: false, reason: 'unknown', message: msg }
}

// ── Reads ──────────────────────────────────────────────────────────────────

// All invitations for a workspace, newest first. Gated by RLS (members.view).
export async function listInvitations(workspaceId: string): Promise<InvitationRow[]> {
  const { data, error } = await client()
    .from('invitations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InvitationRow[]
}

// Just the live pending invitations (server also lazily expires lapsed ones on
// read via validate_invitation; here we filter client-side for the list view).
export async function listPendingInvitations(workspaceId: string): Promise<InvitationRow[]> {
  const all = await listInvitations(workspaceId)
  const now = Date.now()
  return all.filter((i) => i.status === 'pending' && new Date(i.expires_at).getTime() > now)
}

// Resolve a token on the accept screen (invitee may not be a member yet).
export async function validateInvitation(token: string): Promise<InvitationValidation | null> {
  const { data, error } = await client().rpc('validate_invitation', { p_token: token })
  if (error) throw error
  const rows = (data as InvitationValidation[] | null) ?? []
  return rows[0] ?? null
}

// ── Mutations ────────────────────────────────────────────────────────────────

export type CreateInvitationResult = { ok: true; invitation: InvitationRow } | InviteFailure

// Create + persist an invitation. Server generates the token, expiry, and
// pending status. Email/role are validated client-side (fast feedback) and
// server-side (authoritative).
export async function createInvitation(
  workspaceId: string,
  input: InviteInput
): Promise<CreateInvitationResult> {
  const parsed = inviteInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid input'
    }
  }
  const { email, roleId, message } = parsed.data
  const { data, error } = await client().rpc('create_invitation', {
    p_workspace_id: workspaceId,
    p_email: email,
    p_role_id: roleId,
    p_message: message ?? null
  })
  if (error) return classify(error)
  const invitation = data as InvitationRow
  // Best-effort email delivery (Phase-1 stub edge function). A failure here
  // never fails the invite — the owner can still copy/share the link.
  void sendInvitationEmail(invitation)
  return { ok: true, invitation }
}

// Fire-and-forget: ask the edge function to email the invitee. Swallows all
// errors (the invitation already exists; delivery is a bonus).
async function sendInvitationEmail(invitation: InvitationRow): Promise<void> {
  const c = getSupabase()
  if (!c) return
  try {
    await c.functions.invoke('send-invitation-email', {
      body: { invitation_id: invitation.id, accept_url: invitationLink(invitation.token) }
    })
  } catch {
    /* delivery is best-effort */
  }
}

export type AcceptInvitationResult = { ok: true; workspaceId: string } | InviteFailure

// Redeem a token as the currently-authenticated user. Adds/reactivates the
// membership as active and marks the invitation accepted.
export async function acceptInvitation(token: string): Promise<AcceptInvitationResult> {
  const { data, error } = await client().rpc('accept_invitation', { p_token: token })
  if (error) return classify(error)
  const row = data as { workspace_id: string } | null
  return { ok: true, workspaceId: row?.workspace_id ?? '' }
}

export type MutateInvitationResult = { ok: true; invitation: InvitationRow } | InviteFailure

export async function revokeInvitation(invitationId: string): Promise<MutateInvitationResult> {
  const { data, error } = await client().rpc('revoke_invitation', { p_invitation_id: invitationId })
  if (error) return classify(error)
  return { ok: true, invitation: data as InvitationRow }
}

export async function resendInvitation(invitationId: string): Promise<MutateInvitationResult> {
  const { data, error } = await client().rpc('resend_invitation', { p_invitation_id: invitationId })
  if (error) return classify(error)
  return { ok: true, invitation: data as InvitationRow }
}

// ── Invitation link ──────────────────────────────────────────────────────────

// Deep link the owner copies/shares. Uses the app's custom scheme so opening it
// routes into the in-app accept flow (see App router `/invite/:token`).
export function invitationLink(token: string): string {
  return `tubeghost://invite/${token}`
}
