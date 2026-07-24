// Renderer-side wrappers for the lock RPCs.
// All Supabase auth context lives here; main process never speaks to
// Supabase directly.

import { getSupabase } from '@/lib/supabase'

export interface AcquireLockResult {
  acquired: boolean
  held_by_user?: string | null
  held_by_device?: string | null
  held_since?: string | null
  last_heartbeat?: string | null
}

function client() {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured')
  return c
}

export async function tryAcquireProfileLock(
  profileId: string,
  sessionId: string,
  device: string
): Promise<AcquireLockResult> {
  const { data, error } = await client().rpc('try_acquire_profile_lock', {
    p_profile_id: profileId,
    p_session_id: sessionId,
    p_device: device
  })
  if (error) throw error
  return (data ?? { acquired: false }) as AcquireLockResult
}

export async function updateProfileHeartbeat(
  profileId: string,
  sessionId: string
): Promise<boolean> {
  const { data, error } = await client().rpc('update_profile_heartbeat', {
    p_profile_id: profileId,
    p_session_id: sessionId
  })
  if (error) throw error
  return Boolean(data)
}

export async function releaseProfileLock(
  profileId: string,
  sessionId: string
): Promise<boolean> {
  const { data, error } = await client().rpc('release_profile_lock', {
    p_profile_id: profileId,
    p_session_id: sessionId
  })
  if (error) throw error
  return Boolean(data)
}

export async function forceReleaseProfileLock(profileId: string): Promise<boolean> {
  const { data, error } = await client().rpc('force_release_profile_lock', {
    p_profile_id: profileId
  })
  if (error) throw error
  return Boolean(data)
}

export async function updateProfileEgressIp(
  profileId: string,
  sessionId: string,
  egressIp: string
): Promise<boolean> {
  const { data, error } = await client().rpc('update_profile_egress_ip', {
    p_profile_id: profileId,
    p_session_id: sessionId,
    p_egress_ip: egressIp
  })
  if (error) {
    // Surface PostgREST's full error body so callers can diagnose 400s
    // (the parameter shape vs. the SQL function signature is the usual
    // culprit). The caller swallows this; logging here is the only
    // diagnostic surface.
    // eslint-disable-next-line no-console
    console.warn('[update_profile_egress_ip] error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      args: { profileId, sessionId, egressIp }
    })
    throw error
  }
  return Boolean(data)
}

export async function bulkReleaseLocksForSession(sessionIds: string[]): Promise<number> {
  if (sessionIds.length === 0) return 0
  const { data, error } = await client().rpc('bulk_release_locks_for_session', {
    p_session_ids: sessionIds
  })
  if (error) throw error
  return Number(data ?? 0)
}

export interface ActiveSessionRow {
  profile_id: string
  workspace_id: string
  open_session_id: string
  open_by_device: string | null
  open_at: string | null
  open_heartbeat_at: string | null
}

export async function listMyActiveSessions(): Promise<ActiveSessionRow[]> {
  const { data, error } = await client().rpc('list_my_active_sessions')
  if (error) throw error
  return (data ?? []) as ActiveSessionRow[]
}
