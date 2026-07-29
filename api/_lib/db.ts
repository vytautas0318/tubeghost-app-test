// Service-role PostgREST access for the MCP relay + agent endpoints.
//
// Mirrors the thin `rest()` helper in _lib/handoff.ts rather than pulling in
// supabase-js: a handful of typed queries against the 0041 tables. Service-role
// bypasses RLS, so EVERY function here takes a user_id and filters by it — the
// caller must have already resolved+verified ownership (session or device token).

import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from './env.js'

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

// ── Types (row subsets we actually read) ───────────────────────────
export interface DeviceRow {
  id: string
  user_id: string
  name: string
  platform: string | null
  app_version: string | null
  token_hash: string | null
  refresh_token_hash: string | null
  last_seen_at: string | null
  revoked_at: string | null
  write_enabled: boolean
  created_at: string
}

export interface PairingCodeRow {
  code: string
  user_id: string
  expires_at: string
  consumed_at: string | null
}

// ── Pairing codes ──────────────────────────────────────────────────
/** Mint a code via the SECURITY DEFINER RPC (unique + opportunistic cleanup). */
export async function mintPairingCode(userId: string): Promise<{ code: string; expiresAt: string }> {
  const res = await rest('/rpc/mint_pairing_code', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: userId }),
  })
  if (!res.ok) {
    // Include PostgREST's error body so a missing RPC / migration surfaces
    // clearly (e.g. "Could not find the function public.mint_pairing_code").
    const detail = await res.text().catch(() => '')
    throw new Error(`mint_pairing_code failed (${res.status}): ${detail.slice(0, 300)}`)
  }
  const rows = (await res.json()) as { code: string; expires_at: string }[]
  const row = rows[0]
  if (!row) throw new Error('mint_pairing_code returned no row')
  return { code: row.code, expiresAt: row.expires_at }
}

/** Atomically consume an unexpired, unconsumed code → returns its user_id.
 *  The PATCH matches only rows still claimable, so a double-redeem sees none. */
export async function consumePairingCode(code: string): Promise<string | null> {
  const now = new Date().toISOString()
  const q =
    `/pairing_codes?code=eq.${encodeURIComponent(code)}` +
    `&consumed_at=is.null&expires_at=gt.${encodeURIComponent(now)}`
  const res = await rest(q, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ consumed_at: now }),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as PairingCodeRow[]
  return rows[0]?.user_id ?? null
}

// ── Devices ────────────────────────────────────────────────────────
export async function insertDevice(row: {
  user_id: string
  name: string
  platform: string | null
  app_version: string | null
  token_hash: string
  refresh_token_hash: string
}): Promise<DeviceRow> {
  const res = await rest('/devices', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`insertDevice failed (${res.status})`)
  return ((await res.json()) as DeviceRow[])[0]
}

export async function listDevices(userId: string): Promise<DeviceRow[]> {
  const res = await rest(
    `/devices?user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null&order=created_at.desc`,
    { method: 'GET' },
  )
  if (!res.ok) return []
  return (await res.json()) as DeviceRow[]
}

export async function getDeviceById(userId: string, deviceId: string): Promise<DeviceRow | null> {
  const res = await rest(
    `/devices?id=eq.${encodeURIComponent(deviceId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: 'GET' },
  )
  if (!res.ok) return null
  return ((await res.json()) as DeviceRow[])[0] ?? null
}

/** Look a device up by its (hashed) agent OR refresh token. Used by the agent
 *  endpoints to authenticate the Bearer without a user context. */
export async function getDeviceByTokenHash(
  column: 'token_hash' | 'refresh_token_hash',
  hash: string,
): Promise<DeviceRow | null> {
  const res = await rest(`/devices?${column}=eq.${encodeURIComponent(hash)}`, { method: 'GET' })
  if (!res.ok) return null
  return ((await res.json()) as DeviceRow[])[0] ?? null
}

export async function patchDevice(deviceId: string, patch: Partial<DeviceRow>): Promise<void> {
  const res = await rest(`/devices?id=eq.${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`patchDevice failed (${res.status})`)
}

/** Revoke: null the token hashes + stamp revoked_at. Scoped to the owner so a
 *  user can only revoke their own device. Returns true if a row was affected. */
export async function revokeDevice(userId: string, deviceId: string): Promise<boolean> {
  const res = await rest(
    `/devices?id=eq.${encodeURIComponent(deviceId)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        revoked_at: new Date().toISOString(),
        token_hash: null,
        refresh_token_hash: null,
      }),
    },
  )
  if (!res.ok) return false
  return ((await res.json()) as DeviceRow[]).length > 0
}

// ── Command log ────────────────────────────────────────────────────
export async function insertCommandLog(row: {
  id: string
  user_id: string
  device_id: string | null
  tool: string
  args_redacted: Record<string, unknown>
  status: string
  source: string
}): Promise<void> {
  const res = await rest('/command_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`insertCommandLog failed (${res.status})`)
}

export interface CommandLogRow {
  id: string
  user_id: string
  device_id: string | null
  tool: string
  status: string
  error_code: string | null
  duration_ms: number | null
  created_at: string
}

/** Read one command_log row, scoped to the owner (isolation: a user can only
 *  read the status of their OWN commands). */
export async function getCommandLogById(userId: string, id: string): Promise<CommandLogRow | null> {
  const res = await rest(
    `/command_log?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}` +
      `&select=id,user_id,device_id,tool,status,error_code,duration_ms,created_at`,
    { method: 'GET' },
  )
  if (!res.ok) return null
  return ((await res.json()) as CommandLogRow[])[0] ?? null
}

export async function updateCommandLog(
  id: string,
  patch: { status?: string; error_code?: string | null; duration_ms?: number },
): Promise<void> {
  await rest(`/command_log?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  }).catch(() => {
    /* audit best-effort — never fail a command because the log write failed */
  })
}
