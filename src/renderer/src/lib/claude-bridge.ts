// Data layer for Settings → Claude (the MCP device relay).
//
// Devices + command_log are read via Supabase (RLS scopes them to the user).
// Pairing-code generation, live online status, and revoke go through the
// server endpoints (api/devices/*), which need the user's Supabase access token
// as a Bearer — the only SPA→/api authed caller in the app.

import { getSupabase } from '@/lib/supabase'

export interface BridgeDevice {
  id: string
  name: string
  platform: string | null
  app_version: string | null
  online: boolean
  last_seen_at: string | null
  write_enabled: boolean
  created_at: string
}

export interface CommandLogEntry {
  id: string
  device_id: string | null
  tool: string
  status: string
  error_code: string | null
  duration_ms: number | null
  created_at: string
}

async function accessToken(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken()
  if (!token) throw new Error('Not signed in')
  return await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  })
}

// ── Pairing ────────────────────────────────────────────────────────
export async function generatePairingCode(): Promise<{ code: string; expiresAt: string }> {
  const res = await authedFetch('/api/devices/pairing-code', { method: 'POST' })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not generate a code')
  return (await res.json()) as { code: string; expiresAt: string }
}

// ── Devices ────────────────────────────────────────────────────────
/** Live list with online/offline (presence lives in Redis, so this hits the
 *  server endpoint rather than reading the table directly). */
export async function listDevices(): Promise<BridgeDevice[]> {
  const res = await authedFetch('/api/devices')
  if (!res.ok) throw new Error('Could not load devices')
  return ((await res.json()) as { devices: BridgeDevice[] }).devices
}

/** Rename or toggle write_enabled via RLS-guarded PATCH on the devices table.
 *  Only these two columns are user-editable (token hashes / ownership are not). */
export async function updateDevice(
  id: string,
  patch: { name?: string; write_enabled?: boolean },
): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Not signed in')
  const { error } = await supabase.from('devices').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function revokeDevice(id: string): Promise<void> {
  const res = await authedFetch(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not revoke the device')
}

// ── Command log ────────────────────────────────────────────────────
export async function listCommandLog(limit = 50): Promise<CommandLogEntry[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('command_log')
    .select('id,device_id,tool,status,error_code,duration_ms,created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as CommandLogEntry[]
}
