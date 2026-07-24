// Personal/account notification preferences data layer + webhook validation
// and test-send. Prefs persist per-user (user_notification_prefs, self-RLS).
//
// NOTE ON OUTBOUND EVENTS (seam): this layer persists WHAT the user wants and
// validates the webhook. Actually firing webhooks/emails on real workspace
// events (member joined, proxy expiring, …) is a separate dispatcher not built
// here — gateNotification()/the notify-test edge function mark where it plugs
// in. Only events backed by real features are surfaced.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'

function client(): SupabaseClient {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured')
  return c
}

// Event keys — ONLY events that map to features that actually exist today
// (proxies, members, automations). No aspirational events.
export const NOTIFICATION_EVENTS = [
  {
    key: 'proxy_expiring',
    label: 'Proxy expiring soon',
    desc: 'A proxy in your pool is within 3 days of expiry.'
  },
  {
    key: 'profile_launched',
    label: 'Profile launched by a teammate',
    desc: 'Someone opens a profile you own.'
  },
  {
    key: 'member_changed',
    label: 'Member joined or left',
    desc: 'Changes to your workspace team.'
  },
  {
    key: 'automation_done',
    label: 'Automation finished',
    desc: 'A scheduled flow completes or errors.'
  },
  {
    key: 'weekly_summary',
    label: 'Weekly summary',
    desc: 'A digest of activity across the workspace.'
  }
] as const

export type NotificationEventKey = (typeof NOTIFICATION_EVENTS)[number]['key']

export interface NotificationPrefs {
  events: Record<string, boolean>
  notification_email: string | null
  webhook_url: string | null
  login_alerts: boolean
}

const DEFAULT_EVENTS: Record<string, boolean> = {
  proxy_expiring: true,
  profile_launched: false,
  member_changed: true,
  automation_done: true,
  weekly_summary: false
}

export function defaultPrefs(email?: string | null): NotificationPrefs {
  return {
    events: { ...DEFAULT_EVENTS },
    notification_email: email ?? null,
    webhook_url: null,
    login_alerts: true
  }
}

export async function getNotificationPrefs(
  userId: string,
  fallbackEmail?: string | null
): Promise<NotificationPrefs> {
  const { data, error } = await client()
    .from('user_notification_prefs')
    .select('events, notification_email, webhook_url, login_alerts')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return defaultPrefs(fallbackEmail)
  const r = data as Record<string, unknown>
  return {
    events: { ...DEFAULT_EVENTS, ...((r.events as Record<string, boolean>) ?? {}) },
    notification_email: (r.notification_email as string | null) ?? fallbackEmail ?? null,
    webhook_url: (r.webhook_url as string | null) ?? null,
    login_alerts: (r.login_alerts as boolean) ?? true
  }
}

// Upsert the caller's prefs. RLS pins user_id = auth.uid(); we pass it so the
// row keys correctly on first insert.
export async function saveNotificationPrefs(
  userId: string,
  prefs: NotificationPrefs
): Promise<void> {
  const { error } = await client().from('user_notification_prefs').upsert(
    {
      user_id: userId,
      events: prefs.events,
      notification_email: prefs.notification_email,
      webhook_url: prefs.webhook_url,
      login_alerts: prefs.login_alerts
    },
    { onConflict: 'user_id' }
  )
  if (error) throw error
}

// Accept http(s) URLs only. Returns a reason string when invalid, else null.
export function validateWebhookUrl(url: string): string | null {
  if (!url.trim()) return null // empty = no webhook, valid
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return 'Not a valid URL.'
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Must be an http(s) URL.'
  return null
}

// Fire a sample payload at the webhook via the notify-test edge function
// (runs server-side to avoid CORS + to keep the URL off the renderer origin).
export async function sendWebhookTest(url: string): Promise<{ ok: boolean; error?: string }> {
  const reason = validateWebhookUrl(url)
  if (reason || !url.trim()) return { ok: false, error: reason ?? 'Enter a webhook URL first.' }
  const c = getSupabase()
  if (!c) return { ok: false, error: 'Supabase not configured' }
  const { data, error } = await c.functions.invoke('notify-test', {
    body: { webhook_url: url.trim() }
  })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok?: boolean; error?: string } | null
  return { ok: res?.ok ?? false, error: res?.error }
}
