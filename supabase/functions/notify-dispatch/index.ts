// notify-dispatch — fan a workspace event out to the members who opted in.
//
// The renderer calls this on run completion (event 'automation_done'). We read
// each workspace member's user_notification_prefs, and for members who have the
// event enabled we deliver to their configured channels:
//   • webhook_url  → server-side POST (SSRF-guarded), concrete + implemented
//   • notification_email → SEAM: requires an email provider secret (Resend).
//     Marked but not sent here so we don't half-implement email delivery.
//
// Auth required. The caller must be able to view automations in the workspace
// (so a random signed-in user can't spam another workspace's webhooks).
//
// POST { event, workspace_id, title, message, meta? } → { ok, delivered }

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

function svcHeaders(): HeadersInit {
  return {
    apikey: SERVICE_ROLE_KEY ?? '',
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    // TubeGhost tables + RPCs live in the `ghost` schema of the shared
    // project since the DB consolidation — PostgREST selects it by header.
    'Accept-Profile': 'ghost',
    'Content-Profile': 'ghost'
  }
}

async function hasPermission(userId: string, key: string, workspaceId: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_user_permission`, {
    method: 'POST',
    headers: svcHeaders(),
    body: JSON.stringify({ p_user_id: userId, p_permission_key: key, p_workspace_id: workspaceId })
  })
  if (!res.ok) return false
  return (await res.json()) === true
}

// SSRF guard — block loopback / private / link-local / metadata destinations.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h === '' || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (h === '::1' || h === '::') return true
  const mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  const v4 = mapped ? mapped[1] : h
  const m = v4.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  if (a === 0 || a === 127 || a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

async function memberUserIds(workspaceId: string): Promise<string[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/workspace_members?workspace_id=eq.${workspaceId}&select=user_id`,
    { headers: svcHeaders() }
  )
  if (!res.ok) return []
  const rows = (await res.json()) as { user_id: string }[]
  return rows.map((r) => r.user_id)
}

interface PrefRow {
  user_id: string
  events: Record<string, boolean> | null
  webhook_url: string | null
}

async function prefsFor(userIds: string[]): Promise<PrefRow[]> {
  if (userIds.length === 0) return []
  const inList = `(${userIds.map((id) => `"${id}"`).join(',')})`
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_notification_prefs?user_id=in.${inList}&select=user_id,events,webhook_url`,
    { headers: svcHeaders() }
  )
  if (!res.ok) return []
  return (await res.json()) as PrefRow[]
}

async function postWebhook(url: string, payload: unknown): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  if (isBlockedHost(parsed.hostname.replace(/^\[|\]$/g, ''))) return false
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY)
    return jsonResponse({ error: 'server not configured' }, 500)

  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonResponse({ error: 'authentication required' }, 401)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  const event = String(body.event ?? '')
  const workspaceId = String(body.workspace_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId))
    return jsonResponse({ error: 'invalid workspace_id' }, 400)
  if (!event) return jsonResponse({ error: 'missing event' }, 400)
  // Only members who can view automations may trigger the fan-out.
  if (!(await hasPermission(userId, 'automations.view', workspaceId))) {
    return jsonResponse({ error: 'permission denied' }, 403)
  }

  const ids = await memberUserIds(workspaceId)
  const prefs = await prefsFor(ids)
  const payload = {
    text: `${body.title ?? 'TubeGhost'} — ${body.message ?? ''}`.trim(),
    event,
    source: 'TubeGhost',
    meta: body.meta ?? null,
    sent_at: new Date().toISOString()
  }

  let delivered = 0
  for (const p of prefs) {
    const enabled = p.events ? p.events[event] !== false : true
    if (!enabled) continue
    if (p.webhook_url && (await postWebhook(p.webhook_url, payload))) delivered++
    // Email channel: seam — requires an email provider secret (RESEND_API_KEY).
    // Left unimplemented so we don't silently drop or fake email delivery.
  }

  return jsonResponse({ ok: true, delivered })
})
