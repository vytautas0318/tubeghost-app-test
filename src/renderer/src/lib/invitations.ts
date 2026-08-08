// InvitationService — Supabase data layer for the workspace invitation
// lifecycle. All mutations go through SECURITY DEFINER RPCs defined in
// supabase/migrations/00000000000003_ghost_functions.sql, which enforce
// permissions (members.invite) and validation server-side. This module is a
// thin, typed wrapper — RLS + the RPCs are the source of truth, mirroring the
// pattern in lib/roles.ts and lib/users.ts.

import { z } from 'zod'
import { getSupabase, type GhostClient } from '@/lib/supabase'

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

// Projection returned by my_pending_invitations — the invitee's own view of an
// invite addressed to them. Like InvitationValidation it never includes the
// token; acceptance goes through acceptInvitationById instead.
export interface PendingInvitation {
  invitation_id: string
  workspace_id: string
  workspace_name: string
  email: string
  role_id: string
  role_name: string
  message: string | null
  expires_at: string
  created_at: string
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

function client(): GhostClient {
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

// Live invitations addressed to the signed-in user's own email, across all
// workspaces. This is the token-free discovery path: it lets an invitee accept
// from inside the app when the invitation email never arrived, or when they
// signed up on their own before being invited. Server-side the RPC scopes
// strictly to the caller's verified email (migration 0047).
export async function myPendingInvitations(): Promise<PendingInvitation[]> {
  const { data, error } = await client().rpc('my_pending_invitations')
  if (error) throw error
  return (data as PendingInvitation[] | null) ?? []
}

// Resolve a token on the accept screen (invitee may not be a member yet).
export async function validateInvitation(token: string): Promise<InvitationValidation | null> {
  const { data, error } = await client().rpc('validate_invitation', { p_token: token })
  if (error) throw error
  const rows = (data as InvitationValidation[] | null) ?? []
  return rows[0] ?? null
}

// ── Mutations ────────────────────────────────────────────────────────────────

// Delivery outcome of the invitation email, surfaced alongside a successful
// invite so the UI can distinguish "invited + emailed" from "invited but the
// email didn't go out" (previously this failure was silently swallowed, so an
// invitee who never got the email looked identical to a delivered one).
//   'sent'         → Resend accepted the message
//   'not-delivered'→ function ran but no mail provider delivered (stub / send failed)
//   'failed'       → the send call itself errored (network / function error)
export type EmailDelivery = 'sent' | 'not-delivered' | 'failed'

export type CreateInvitationResult =
  | { ok: true; invitation: InvitationRow; delivery: EmailDelivery }
  | InviteFailure

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
  if (error) {
    const failure = classify(error)
    // Inviting an email that already has a live pending invite is not really an
    // error — the user just wants to (re)send it. create_invitation raises in
    // that case, so we'd otherwise return 'duplicate' and NEVER send an email
    // (the invitee gets nothing). Fall back to resending the existing invite,
    // which mints a fresh token + actually delivers the email.
    if (failure.reason === 'duplicate') {
      const existing = (await listPendingInvitations(workspaceId)).find(
        (i) => i.email.toLowerCase() === email
      )
      if (existing) {
        const r = await resendInvitation(existing.id)
        if (r.ok) return { ok: true, invitation: r.invitation, delivery: r.delivery }
        return r
      }
    }
    return failure
  }
  const invitation = data as InvitationRow
  // Email delivery is still best-effort — a failure never rolls back the invite
  // (the owner can copy/share the link). But we now RETURN the outcome so the
  // UI can warn "invited, but the email didn't send" instead of showing a
  // false success and leaving the invitee waiting for a mail that never came.
  const delivery = await sendInvitationEmail(invitation)
  return { ok: true, invitation, delivery }
}

// Ask the edge function to email the invitee and report the outcome. Never
// throws — returns a delivery status the caller can surface. The edge function
// responds { ok, delivered }: delivered=false means it ran but no provider
// actually sent (stub, or Resend rejected the send).
async function sendInvitationEmail(invitation: InvitationRow): Promise<EmailDelivery> {
  const c = getSupabase()
  if (!c) return 'failed'
  try {
    const { data, error } = await c.functions.invoke('send-invitation-email', {
      body: { invitation_id: invitation.id, accept_url: invitationLink(invitation.token) }
    })
    if (error) {
      // TEMP DIAGNOSTIC: surface the real failure. supabase-js puts the function's
      // response body on error.context; log it so the exact stage is visible in
      // DevTools console when a send fails. Remove once delivery is confirmed.
      try {
        const ctx = (error as { context?: Response }).context
        const detail = ctx ? await ctx.clone().text() : ''
        // eslint-disable-next-line no-console
        console.error('[sendInvitationEmail] invoke error:', error.message, '| body:', detail)
      } catch {
        // eslint-disable-next-line no-console
        console.error('[sendInvitationEmail] invoke error:', (error as Error).message)
      }
      return 'failed'
    }
    const delivered = (data as { delivered?: boolean } | null)?.delivered === true
    if (!delivered) {
      // eslint-disable-next-line no-console
      console.error('[sendInvitationEmail] function ran but delivered=false. data:', data)
    }
    return delivered ? 'sent' : 'not-delivered'
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[sendInvitationEmail] threw:', (e as Error).message)
    return 'failed'
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

// Redeem an invitation discovered via myPendingInvitations, by id instead of
// token. The id is not a capability — the server authorizes on the email match
// (see 0047), so this is exactly as safe as the token path.
export async function acceptInvitationById(invitationId: string): Promise<AcceptInvitationResult> {
  const { data, error } = await client().rpc('accept_invitation_by_id', {
    p_invitation_id: invitationId
  })
  if (error) return classify(error)
  const row = data as { workspace_id: string } | null
  return { ok: true, workspaceId: row?.workspace_id ?? '' }
}

export type MutateInvitationResult = { ok: true; invitation: InvitationRow } | InviteFailure

// Resend carries a delivery status too — clicking "Resend" must actually put an
// email in the invitee's inbox, not just refresh the DB row.
export type ResendInvitationResult =
  | { ok: true; invitation: InvitationRow; delivery: EmailDelivery }
  | InviteFailure

export async function revokeInvitation(invitationId: string): Promise<MutateInvitationResult> {
  const { data, error } = await client().rpc('revoke_invitation', { p_invitation_id: invitationId })
  if (error) return classify(error)
  return { ok: true, invitation: data as InvitationRow }
}

export async function resendInvitation(invitationId: string): Promise<ResendInvitationResult> {
  // The RPC mints a fresh token + expiry but does NOT send mail. Previously
  // that was the whole implementation, so "Resend" silently emailed nobody.
  // Now we send the email with the new token and report the outcome.
  const { data, error } = await client().rpc('resend_invitation', { p_invitation_id: invitationId })
  if (error) return classify(error)
  const invitation = data as InvitationRow
  const delivery = await sendInvitationEmail(invitation)
  return { ok: true, invitation, delivery }
}

// ── Invitation link ──────────────────────────────────────────────────────────

// Web origin that hosts the invite bridge page (AcceptInvite.tsx). That page's
// only job is to hand the token to the desktop app via `tubeghost://invite/...`.
const WEB_ORIGIN = 'https://app.tubeghost.com'

// Link the owner copies/shares, and the target of the invitation email button.
// Deliberately an https:// URL, NOT the raw `tubeghost://` deep link: custom
// schemes aren't clickable in most mail/chat clients (Gmail strips them, Slack
// renders them as plain text), so a copied link was unusable for the invitee.
// The https page redirects to the deep link, so the end result is identical —
// and it degrades to a download prompt when the app isn't installed.
export function invitationLink(token: string): string {
  return `${WEB_ORIGIN}/invite/${token}`
}

// The raw deep link, for callers already running inside a browser page that
// want to hand off to the desktop app directly (see AcceptInvite.tsx).
export function invitationDeepLink(token: string): string {
  return `tubeghost://invite/${token}`
}
