// send-invitation-email — deliver a workspace invitation email.
//
// The function validates the caller, confirms the invitation exists and belongs
// to a workspace where the caller can invite, builds the branded message, and
// sends it via Resend.
//
// Why an Edge Function (not renderer): the mail-provider API key is a real
// secret and must never ship in the Electron bundle. See CLAUDE.md → Secrets.
//
// Required edge secrets for mail to actually go out:
//   RESEND_API_KEY     — without it the function logs instead of sending and
//                        returns delivered:false with an explanatory reason.
//   INVITE_FROM_EMAIL  — e.g. "TubeGhost <invites@tubeghost.com>". Defaults to
//                        Resend's shared test sender, which ONLY delivers to
//                        the owner of the Resend account — that default is why
//                        invites to other people silently never arrive.
//   PUBLIC_APP_URL     — origin hosting /invite/:token. Default app.tubeghost.com.
//
//   npx supabase secrets set RESEND_API_KEY=... INVITE_FROM_EMAIL='TubeGhost <invites@tubeghost.com>'
//   npx supabase functions deploy send-invitation-email
//
// Request:  POST { invitation_id: string, accept_url?: string (ignored) }
// Response: { ok: true, delivered: boolean, reason?: string } | { error }

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
// Absent → we log instead of sending, and say so in the response.
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
// Resend's shared sender needs no DNS setup but only delivers to the Resend
// account owner. Override once a sending domain is verified.
const FROM_ADDRESS = Deno.env.get('INVITE_FROM_EMAIL') ?? 'TubeGhost <onboarding@resend.dev>'
const APP_BASE = (Deno.env.get('PUBLIC_APP_URL') ?? 'https://app.tubeghost.com').replace(/\/+$/, '')

interface SendRequest {
  invitation_id: string
  accept_url?: string
}

interface InvitationRecord {
  id: string
  workspace_id: string
  email: string
  status: string
  token: string
  message: string | null
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
    // No provider configured — log and say so explicitly. This is by far the
    // most common cause of "the invitee never got an email", and reporting it
    // as a generic failure sent admins hunting in the wrong place.
    console.log(`[send-invitation-email] (stub, no provider) → ${to}: ${subject}`)
    console.log(html)
    return {
      delivered: false,
      reason:
        'No mail provider is configured. Set the RESEND_API_KEY edge secret to enable invitation emails.'
    }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html })
  })
  if (res.ok) return { delivered: true }

  // Report WHY. The classic failure here is Resend's shared test sender
  // (onboarding@resend.dev), which is only allowed to deliver to the address on
  // your own Resend account — inviting anyone else returns 403. That looked
  // identical to "sending is broken" before.
  const body = await res.text()
  console.error(`[send-invitation-email] resend ${res.status}: ${body}`)
  if (res.status === 403 && FROM_ADDRESS.includes('resend.dev')) {
    return {
      delivered: false,
      reason:
        `Resend's test sender (${FROM_ADDRESS}) can only email the owner of the Resend account. ` +
        'Verify a sending domain in Resend and set the INVITE_FROM_EMAIL edge secret to send to anyone.'
    }
  }
  const parsed = ((): { message?: string } | null => {
    try {
      return JSON.parse(body) as { message?: string }
    } catch {
      return null
    }
  })()
  return { delivered: false, reason: parsed?.message ?? `Mail provider returned ${res.status}.` }
}

// Brand-styled invitation email. Table-based + all-inline CSS because mail
// clients (Outlook especially) drop <style> blocks, flexbox and CSS variables.
function invitationHtml(opts: {
  workspace: string
  role: string
  acceptUrl: string
  message: string | null
}): string {
  const note = opts.message
    ? `<tr><td style="padding:0 36px 24px;">
         <div style="border-left:3px solid #E60000;background:#FAFAF7;padding:12px 16px;
                     font-size:14px;line-height:1.55;color:#4A4A48;border-radius:0 6px 6px 0;">
           ${escapeHtml(opts.message)}
         </div>
       </td></tr>`
    : ''

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F2F1EA;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F1EA;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#FFFFFF;border:1px solid #E4E2D8;border-radius:14px;
                    font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <tr><td style="padding:32px 36px 0;">
          <div style="font-size:15px;font-weight:800;letter-spacing:-0.2px;color:#0F0F0F;">
            Tube<span style="color:#E60000;">Ghost</span>
          </div>
        </td></tr>
        <tr><td style="padding:24px 36px 0;">
          <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:700;color:#0F0F0F;">
            You've been invited to ${escapeHtml(opts.workspace)}
          </h1>
          <p style="margin:0 0 24px;font-size:14.5px;line-height:1.6;color:#5A5A57;">
            You're invited to join <strong style="color:#0F0F0F;">${escapeHtml(opts.workspace)}</strong>
            on TubeGhost as <strong style="color:#0F0F0F;">${escapeHtml(opts.role)}</strong>.
          </p>
        </td></tr>
        ${note}
        <tr><td style="padding:0 36px 8px;">
          <a href="${opts.acceptUrl}"
             style="display:inline-block;background:#E60000;color:#FFFFFF;text-decoration:none;
                    font-size:14.5px;font-weight:600;padding:13px 26px;border-radius:9px;">
            Accept invitation
          </a>
        </td></tr>
        <tr><td style="padding:20px 36px 0;">
          <p style="margin:0 0 6px;font-size:12px;color:#8A8A85;">
            Or paste this link into your browser:
          </p>
          <p style="margin:0;font-size:12px;font-family:'JetBrains Mono',Menlo,Consolas,monospace;
                    color:#5A5A57;word-break:break-all;">${opts.acceptUrl}</p>
        </td></tr>
        <tr><td style="padding:24px 36px 32px;">
          <div style="border-top:1px solid #EDEBE2;padding-top:16px;font-size:12px;line-height:1.6;color:#8A8A85;">
            This invitation expires in 7 days. If you weren't expecting it, you can safely ignore this email.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// Workspace/role names and the inviter's message are user-supplied, so they are
// escaped before they reach the HTML body.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  // accept_url is still accepted (older clients send it) but no longer used —
  // see the comment where the accept URL is built below.
  if (!body.invitation_id) {
    return jsonResponse({ error: 'invitation_id is required' }, 400)
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

  const { delivered, reason } = await sendEmail(inv.email, subject, html)
  return jsonResponse({ ok: true, delivered, ...(reason ? { reason } : {}) })
})
