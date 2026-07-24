// Active login-sessions data layer (personal/account). Backed by
// user_login_sessions (our ledger) + the `sessions` Edge Function (service_role)
// which reconciles with GoTrue and performs real revocation.
//
// The renderer registers THIS device on sign-in (registerCurrentSession), lists
// all sessions (listSessions), revokes another device (revokeSession), and
// signs out everywhere (revokeAllOtherSessions). Revocation is real: the edge
// function calls auth.admin.signOut so the revoked device's refresh token dies.

import { getSupabase } from '@/lib/supabase'

const DEVICE_ID_KEY = 'tpb-device-id'

export interface LoginSession {
  id: string
  device_id: string
  device: string | null
  browser: string | null
  ip: string | null
  location: string | null
  last_seen: string
  revoked_at: string | null
  is_current: boolean
}

// Stable per-install device id — generated once, persisted in localStorage.
export function currentDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

// Best-effort human device/browser labels from the UA.
async function describeDevice(): Promise<{ device: string; browser: string }> {
  const ua = navigator.userAgent
  const os = /Mac OS X|Macintosh/.test(ua)
    ? 'macOS'
    : /Windows/.test(ua)
      ? 'Windows PC'
      : /Linux|X11/.test(ua)
        ? 'Linux'
        : 'Device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : 'Browser'
  return { device: os, browser }
}

// Upsert this device's session row + refresh last_seen. Call on sign-in and on
// a periodic heartbeat. Silent no-op in demo mode.
export async function registerCurrentSession(userId: string): Promise<void> {
  const c = getSupabase()
  if (!c) return
  const { device, browser } = await describeDevice()
  await c.from('user_login_sessions').upsert(
    {
      user_id: userId,
      device_id: currentDeviceId(),
      device,
      browser,
      last_seen: new Date().toISOString(),
      revoked_at: null
    },
    { onConflict: 'user_id,device_id' }
  )
}

export async function listSessions(userId: string): Promise<LoginSession[]> {
  const c = getSupabase()
  if (!c) return []
  const { data, error } = await c
    .from('user_login_sessions')
    .select('id, device_id, device, browser, ip, location, last_seen, revoked_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('last_seen', { ascending: false })
  if (error) throw error
  const me = currentDeviceId()
  return (data ?? []).map((r) => ({
    ...(r as Omit<LoginSession, 'is_current'>),
    is_current: (r as { device_id: string }).device_id === me
  }))
}

// Revoke a specific OTHER device. Delegates to the edge function so GoTrue's
// refresh token is actually killed (not just our ledger flag).
export async function revokeSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase()
  if (!c) return { ok: false, error: 'Supabase not configured' }
  const { data, error } = await c.functions.invoke('sessions', {
    body: { action: 'revoke', session_id: sessionId }
  })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok?: boolean; error?: string } | null
  return { ok: res?.ok ?? false, error: res?.error }
}

// Sign out every device EXCEPT the current one.
export async function revokeAllOtherSessions(): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase()
  if (!c) return { ok: false, error: 'Supabase not configured' }
  const { data, error } = await c.functions.invoke('sessions', {
    body: { action: 'revoke_others', device_id: currentDeviceId() }
  })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok?: boolean; error?: string } | null
  return { ok: res?.ok ?? false, error: res?.error }
}
