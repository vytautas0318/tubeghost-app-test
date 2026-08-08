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
  app_roles?: { name: string; description: string | null } | null
}

// Minimal service-role read: fetch the invitation + workspace + role names.
// The role's `description` is pulled too so the email can explain what the
// invitee is actually being granted (mirrors the TubeProxies invite email).
async function fetchInvitation(id: string): Promise<InvitationRecord | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/invitations?id=eq.${id}` +
      `&select=id,workspace_id,email,status,created_by,workspaces(name),app_roles(name,description)`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY ?? '',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        // invitations/workspaces/app_roles live in the `ghost` schema
        'Accept-Profile': 'ghost'
      }
    }
  )
  if (!res.ok) return null
  const rows = (await res.json()) as InvitationRecord[]
  return rows[0] ?? null
}

// Display name of whoever sent the invite, for the "X has invited you" line.
// Best-effort: falls back to a neutral phrasing when the lookup fails or the
// user never set a name, so a missing name never blocks delivery.
// Read through the Admin API rather than a table: there is no `user_details`
// table (get_workspace_user_details is an RPC that derives the name from
// auth.users), and auth.users is not exposed over PostgREST. Mirrors that
// RPC's fallback order: full_name → name → the email's local part.
async function fetchInviterName(userId: string | null): Promise<string | null> {
  if (!userId) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: {
        apikey: SERVICE_ROLE_KEY ?? '',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`
      }
    })
    if (!res.ok) return null
    const u = (await res.json()) as {
      email?: string
      user_metadata?: { full_name?: string; name?: string }
    }
    const name =
      u.user_metadata?.full_name?.trim() ||
      u.user_metadata?.name?.trim() ||
      (u.email ? u.email.split('@')[0] : '')
    return name ? name : null
  } catch {
    return null
  }
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
      'Content-Type': 'application/json',
      // check_user_permission lives in the `ghost` schema
      'Content-Profile': 'ghost'
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

// ── Email template ──────────────────────────────────────────────────────────
// Ported from the TubeProxies invite email (dashboard: src/lib/email/
// templates.ts → baseTemplate + teamInviteTemplate) so both products look like
// one family. Kept as inline-CSS-in-<style> exactly like the original: real
// mail clients need it, and diverging would make the two drift apart.

const BRAND_COLOR = '#EF0039'
// Must be a publicly reachable absolute URL — mail clients can't read bundled
// assets. This is the live marketing-site logo (200, image/png, no redirect on
// the apex domain; www. 307s, so don't use it).
const LOGO_URL = 'https://tubeghost.com/assets/logo.png'

// Escape anything interpolated into the HTML. The workspace name, role name
// and inviter name are all user-supplied, so without this a member could name a
// workspace `<script>…` (or just break the layout with a stray `<`) and have it
// rendered in someone else's inbox.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TubeGhost</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
    }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card {
      background: #ffffff;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    /* The TubeGhost mark is a SQUARE icon (256x256), not a wide wordmark like
       TubeProxies' — so it's sized as a 56px icon and paired with a text
       wordmark below it. Rendering it in the 180px slot the original template
       used would blow it up into an oversized block. */
    .logo { text-align: center; margin-bottom: 24px; }
    .logo img { width: 56px; height: 56px; display: block; margin: 0 auto 8px; }
    .logo-text {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
      letter-spacing: -0.01em;
    }
    h2 { color: #1e293b; margin-top: 0; margin-bottom: 16px; }
    p { margin: 0 0 16px; }
    .button {
      display: inline-block;
      background: ${BRAND_COLOR};
      color: #ffffff !important;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      margin: 16px 0;
    }
    .info-box { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .label {
      color: #64748b;
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .footer { text-align: center; margin-top: 32px; color: #64748b; font-size: 14px; }
    .footer a { color: #64748b; }
    .muted { color: #64748b; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">
        <img src="${LOGO_URL}" width="56" height="56" alt="TubeGhost" />
        <div class="logo-text">TubeGhost</div>
      </div>
      ${content}
    </div>
    <div class="footer">
      <p>TubeGhost - Antidetect Browser for YouTube</p>
      <p>You received this email because someone invited you to a TubeGhost workspace.</p>
    </div>
  </div>
</body>
</html>`
}

function invitationTemplate(o: {
  workspaceName: string
  roleName: string
  roleDescription: string | null
  inviterName: string | null
  acceptUrl: string
}): string {
  // "Vytautas B. has invited you…" when we know who sent it, otherwise an
  // impersonal phrasing rather than a dangling name.
  const intro = o.inviterName
    ? `<strong>${esc(o.inviterName)}</strong> has invited you to join <strong>${esc(o.workspaceName)}</strong> on TubeGhost.`
    : `You've been invited to join <strong>${esc(o.workspaceName)}</strong> on TubeGhost.`

  return baseTemplate(`
    <h2>You've Been Invited to Join a Workspace</h2>
    <p>Hi there,</p>
    <p>${intro}</p>

    <div class="info-box">
      <div class="label">Your Role</div>
      <h3 style="margin: 8px 0 4px;">${esc(o.roleName)}</h3>
      ${
        o.roleDescription
          ? `<p class="muted" style="margin: 0;">${esc(o.roleDescription)}</p>`
          : ''
      }
    </div>

    <p>Click the button below to accept the invitation and join the workspace.</p>

    <a href="${esc(o.acceptUrl)}" class="button">Accept Invitation</a>

    <p class="muted">This invitation expires in 7 days. If you don't have a TubeGhost account, you'll be asked to create one first.</p>
  `)
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
  const roleName = inv.app_roles?.name ?? 'Member'
  const inviterName = await fetchInviterName(inv.created_by)
  const subject = `You're invited to join ${wsName} on TubeGhost`
  const html = invitationTemplate({
    workspaceName: wsName,
    roleName,
    roleDescription: inv.app_roles?.description ?? null,
    inviterName,
    acceptUrl: body.accept_url
  })

  const delivered = await sendEmail(inv.email, subject, html)
  return jsonResponse({ ok: true, delivered })
})
