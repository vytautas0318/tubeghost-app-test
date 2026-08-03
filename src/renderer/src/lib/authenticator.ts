// Supabase data layer for the Authenticator (TOTP 2FA) feature.
// Mirrors lib/proxies.ts. Secrets are opaque ciphertext here — the raw
// Base32 seed only exists transiently inside the `totp` Edge Function,
// which encrypts on enroll and decrypts to compute codes / reveal keys.
// RLS gates rows by twofa.* permission keys (migration 0018).

import { getSupabase, type GhostClient } from '@/lib/supabase'

export type AuthPlatform = 'yt' | 'ig' | 'tt' | 'x' | 'fb' | 'am' | 'other'

export interface AuthTokenRow {
  id: string
  workspace_id: string
  platform: AuthPlatform
  issuer: string
  handle: string | null
  label: string | null
  secret_encrypted: string
  algorithm: string
  digits: number
  period: number
  tags: string[]
  assigned_profile_id: string | null
  created_by: string | null
  created_at: string
}

function client(): GhostClient {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

export async function listAuthTokens(workspaceId: string): Promise<AuthTokenRow[]> {
  const { data, error } = await client()
    .from('authenticator_tokens')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as AuthTokenRow[]
}

export interface NewAuthTokenInput {
  workspace_id: string
  platform: AuthPlatform
  issuer: string
  handle?: string | null
  label?: string | null
  secret: string // raw Base32 — encrypted server-side before insert
  algorithm?: string
  digits?: number
  period?: number
  tags?: string[]
  assigned_profile_id?: string | null
}

// Enroll a new account. Encrypts the seed via the Edge Function, then
// inserts the ciphertext. RLS enforces twofa.manage_tokens on the insert.
export async function createAuthToken(input: NewAuthTokenInput): Promise<AuthTokenRow> {
  const secret_encrypted = await encryptSeed(input.secret)
  const { data, error } = await client()
    .from('authenticator_tokens')
    .insert({
      workspace_id: input.workspace_id,
      platform: input.platform,
      issuer: input.issuer.trim(),
      handle: input.handle?.trim() || null,
      label: input.label?.trim() || null,
      secret_encrypted,
      algorithm: input.algorithm ?? 'SHA1',
      digits: input.digits ?? 6,
      period: input.period ?? 30,
      tags: input.tags ?? [],
      assigned_profile_id: input.assigned_profile_id ?? null
    })
    .select('*')
    .single()
  if (error) throw error
  return data as AuthTokenRow
}

export async function deleteAuthToken(id: string): Promise<void> {
  const { error } = await client().from('authenticator_tokens').delete().eq('id', id)
  if (error) throw error
}

export async function updateAuthToken(
  id: string,
  patch: Partial<Pick<AuthTokenRow, 'tags' | 'assigned_profile_id' | 'label'>>
): Promise<void> {
  const { error } = await client().from('authenticator_tokens').update(patch).eq('id', id)
  if (error) throw error
}

// ── Edge Function wrappers (secrets never leave the server plaintext) ─────

function invoke<T>(body: Record<string, unknown>): Promise<T> {
  return client()
    .functions.invoke<T | { error: string }>('totp', { body })
    .then(({ data, error }) => {
      if (error) throw error
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error((data as { error: string }).error)
      }
      return data as T
    })
}

export async function encryptSeed(secret: string): Promise<string> {
  const r = await invoke<{ ok: boolean; secret_encrypted: string }>({ action: 'encrypt', secret })
  return r.secret_encrypted
}

// Batch-compute current codes for many tokens against one timestamp, so
// every card on the shared tick reads a consistent boundary. Server checks
// twofa.view per workspace; unauthorized ids are simply omitted.
export async function generateCodes(
  tokenIds: string[],
  atSeconds?: number
): Promise<Record<string, string>> {
  if (tokenIds.length === 0) return {}
  const r = await invoke<{ codes: Record<string, string> }>({
    action: 'generate',
    token_ids: tokenIds,
    at_seconds: atSeconds
  })
  return r.codes ?? {}
}

// Reveal the raw Base32 seed for "Show setup key". Gated by twofa.reveal_seed
// server-side — a role without it gets a 403 even if it bypasses the UI.
export async function revealSeed(tokenId: string): Promise<string> {
  const r = await invoke<{ secret: string }>({ action: 'reveal', token_id: tokenId })
  return r.secret
}

export interface ExportedToken {
  id: string
  issuer: string
  handle: string | null
  secret: string
  algorithm: string
  digits: number
  period: number
}

// Export all seeds in a workspace. Gated by twofa.export server-side.
export async function exportTokens(workspaceId: string): Promise<ExportedToken[]> {
  const r = await invoke<{ tokens: ExportedToken[] }>({
    action: 'export',
    workspace_id: workspaceId
  })
  return r.tokens ?? []
}

// Auto-fill seam (§10). Returns the CURRENT 6-digit code for the 2FA account
// assigned to `profileId`, or null if none is assigned (or the caller lacks
// twofa.view — the Edge Function omits unauthorized tokens). Computed fresh:
// looks up the assigned token, then asks the function to generate against now.
// Called at profile-launch time so a stale code is never sent to the browser.
export async function getCurrentCode(profileId: string): Promise<string | null> {
  const { data, error } = await client()
    .from('authenticator_tokens')
    .select('id')
    .eq('assigned_profile_id', profileId)
    .limit(1)
  if (error || !data || data.length === 0) return null
  const codes = await generateCodes([data[0].id as string])
  return codes[data[0].id as string] ?? null
}
