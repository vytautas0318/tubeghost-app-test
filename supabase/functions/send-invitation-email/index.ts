// send-invitation-email — deliver a workspace invitation email.
//
// Phase-1 STUB: no real mail provider is wired yet. The function validates the
// caller, confirms the invitation exists and belongs to a workspace where the
// caller can invite, builds the message, and logs it. Swap the `sendEmail`
// body for a real provider (Resend) later — set RESEND_API_KEY as an Edge
// secret and call their API. Nothing else changes.
//
// Why an Edge Function (not renderer): the mail-provider API key is a real
// secret and must never ship in the Electron bundle. See CLAUDE.md → Secrets.
//
// Request:  POST { invitation_id: string, accept_url: string }
// Response: { ok: true, delivered: boolean } | { error }

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
// Present once mail is wired; absent today → we log instead of send.
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

interface SendRequest {
  invitation_id: string
  accept_url: string
}

interface InvitationRecord {
  id: string
  workspace_id: string
  email: string
  status: string
  created_by: string | null
  workspaces?: { name: string } | null
  app_roles?: { name: string } | null
}

// Minimal service-role read: fetch the invitation + workspace + role names.
async function fetchInvitation(id: string): Promise<InvitationRecord | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/invitations?id=eq.${id}` +
      `&select=id,workspace_id,email,status,created_by,workspaces(name),app_roles(name)`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY ?? '',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`
      }
    }
  )
  if (!res.ok) return null
  const rows = (await res.json()) as InvitationRecord[]
  return rows[0] ?? null
}

// Confirm the caller may invite in this workspace (defense in depth — the
// create_invitation RPC already gated creation, but the email endpoint is a
// separate surface).
async function callerCanInvite(userId: string, workspaceId: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_user_permission`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY ?? '',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_permission_key: 'members.invite',
      p_workspace_id: workspaceId
    })
  })
  if (!res.ok) return false
  return (await res.json()) === true
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    // STUB: no provider configured — log and report "not delivered".
    console.log(`[send-invitation-email] (stub, no provider) → ${to}: ${subject}`)
    console.log(html)
    return false
  }
  // Real path (enable by setting RESEND_API_KEY):
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // TODO: switch back to `TubeGhost <invites@tubeproxies.com>` once the
      // tubeproxies.com sending domain is verified in Resend. Until then we use
      // Resend's shared test sender, which needs NO DNS setup but only delivers
      // to the address on your own Resend account.
      from: 'TubeGhost <onboarding@resend.dev>',
      to,
      subject,
      html
    })
  })
  return res.ok
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handleCors(req)
  if (pre) return pre

  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Function not configured' }, 500)
  }

  let body: SendRequest
  try {
    body = (await req.json()) as SendRequest
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  if (!body.invitation_id || !body.accept_url) {
    return jsonResponse({ error: 'invitation_id and accept_url are required' }, 400)
  }

  const inv = await fetchInvitation(body.invitation_id)
  if (!inv) return jsonResponse({ error: 'Invitation not found' }, 404)
  if (inv.status !== 'pending') {
    return jsonResponse({ error: 'Invitation is not pending' }, 409)
  }
  if (!(await callerCanInvite(userId, inv.workspace_id))) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const wsName = inv.workspaces?.name ?? 'a workspace'
  const roleName = inv.app_roles?.name ?? 'member'
  const subject = `You're invited to join ${wsName} on TubeGhost`
  const html = `
    <p>You've been invited to join <strong>${wsName}</strong> as <strong>${roleName}</strong>.</p>
    <p><a href="${body.accept_url}">Accept your invitation</a></p>
    <p>If you didn't expect this, you can ignore this email.</p>
  `

  const delivered = await sendEmail(inv.email, subject, html)
  return jsonResponse({ ok: true, delivered })
})
