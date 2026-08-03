// Supabase proxies data layer.
// Mirrors the lib/groups.ts and lib/profiles.ts patterns.

import { getSupabase, type GhostClient } from '@/lib/supabase'

export type ProxySource = 'tubeproxies' | 'custom'
export type ProxyType = 'http' | 'https' | 'socks5' | 'wireguard'
export type ProxyStatus = 'active' | 'expired' | 'released' | 'error'

export interface ProxyRow {
  id: string
  workspace_id: string
  source: ProxySource
  tubeproxies_ip_id: string | null
  label: string | null
  proxy_type: ProxyType
  host: string
  port: number
  username: string | null
  password_encrypted: string | null
  country_code: string | null
  country_name: string | null
  city: string | null
  region: string | null
  timezone: string | null
  status: ProxyStatus
  last_synced_at: string | null
  expires_at: string | null
  last_known_egress_ip: string | null
  last_tested_at: string | null
  last_test_ok: boolean | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Workspace-scoped ordinal assigned at INSERT time by trigger (migration 0010).
  // Null only on rows created before the migration ran.
  proxy_number: number | null
}

function client(): GhostClient {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

const PROXY_PAGE_LIMIT = 1000

export async function listProxies(workspaceId: string): Promise<ProxyRow[]> {
  const { data, error, count } = await client()
    .from('proxies')
    .select('*', { count: 'estimated' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(0, PROXY_PAGE_LIMIT - 1)
  if (error) throw error
  if ((count ?? 0) > PROXY_PAGE_LIMIT) {
    // eslint-disable-next-line no-console
    console.warn(
      `[listProxies] Workspace ${workspaceId} has ${count} proxies but we only loaded ${PROXY_PAGE_LIMIT}. ` +
        `Add proper pagination — TODO Phase 2.`
    )
  }
  return (data ?? []) as ProxyRow[]
}

// All proxies visible to the current user regardless of the active workspace.
// RLS on ghost.proxies returns exactly the rows the caller is entitled to see
// across their workspaces, so we omit the workspace_id filter here.
export async function listMyProxies(): Promise<ProxyRow[]> {
  const { data, error } = await client()
    .from('proxies')
    .select('*')
    .order('created_at', { ascending: false })
    .range(0, PROXY_PAGE_LIMIT - 1)
  if (error) throw error
  return (data ?? []) as ProxyRow[]
}

// Result of the on-demand pull. Lets the UI report a real outcome: how many
// purchased proxies were found and how many were upserted locally.
export interface SyncMyProxiesResult {
  email_matched: boolean
  found: number
  upserted: number
  skipped: Array<{ id: string; reason: string }>
}

// Pull the signed-in user's purchased proxies on demand.
//
// An IN-DATABASE RPC, not an edge function. TubeGhost and TubeProxies now
// share one database, so `ghost.sync_my_purchased_proxies` reads
// public.proxies ⋈ public.proxy_inventory directly and matches on auth.uid().
// That removes the cross-project email bridge entirely — and with it the
// duplicate-mirror-row ambiguity the old sync_outbox / sync-phone-number
// bridge chased.
export async function syncMyProxies(workspaceId: string): Promise<SyncMyProxiesResult> {
  const { data, error } = await client().rpc('sync_my_purchased_proxies', {
    p_workspace_id: workspaceId
  })
  if (error) throw new Error(error.message)
  // The RPC returns the number of rows upserted. `email_matched` is retained
  // for call-site compatibility and is always true: identity is auth.uid(),
  // so there is no email match to fail.
  const upserted = typeof data === 'number' ? data : 0
  return { email_matched: true, found: upserted, upserted, skipped: [] }
}

// A purchased proxy that failed to sync from TubeProxies and is parked in
// the server-side retry queue. Surfaced so "Sync now" can report a real
// reason instead of silently showing 0 rows.
export interface ProxySyncIssue {
  entity_id: string
  host: string | null
  port: number | null
  attempts: number
  last_error: string | null
  next_retry_at: string | null
}

// The caller's own stuck purchased-proxy syncs (scoped to auth.uid() inside
// the RPC). Empty array = nothing pending. Never throws for the common
// "function not deployed yet" case — returns [] so the UI degrades cleanly.
export async function getProxySyncHealth(): Promise<ProxySyncIssue[]> {
  const { data, error } = await client().rpc('get_proxy_sync_health')
  if (error) {
    // 404 (function absent) or a transient error shouldn't break Refresh.
    console.warn('[getProxySyncHealth]', error.message)
    return []
  }
  return (data ?? []) as ProxySyncIssue[]
}

// NOTE: proxy password reveal no longer goes through a server call. The value
// is already present in the loaded proxy row (`password_encrypted`, stored
// as-is — Vault was never wired), so both the table (RevealPassword) and the
// detail drawer read it directly from row data.

export interface NewCustomProxyInput {
  workspace_id: string
  label?: string | null
  proxy_type: ProxyType
  host: string
  port: number
  username?: string | null
  password?: string | null
  country_code?: string | null
  country_name?: string | null
  city?: string | null
  region?: string | null
  timezone?: string | null
  notes?: string | null
}

// Insert a custom (non-TubeProxies) proxy. TubeProxies-sourced proxies
// are created by the sync flow (Phase 3), not by this function.
export async function createCustomProxy(input: NewCustomProxyInput): Promise<ProxyRow> {
  const { data, error } = await client()
    .from('proxies')
    .insert({
      workspace_id: input.workspace_id,
      source: 'custom',
      label: input.label ?? null,
      proxy_type: input.proxy_type,
      host: input.host.trim(),
      port: input.port,
      username: input.username?.trim() || null,
      // TODO: encrypt via Supabase Vault in Phase 5. Stored as plaintext for now.
      password_encrypted: input.password || null,
      country_code: input.country_code ?? null,
      country_name: input.country_name ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      timezone: input.timezone ?? null,
      notes: input.notes ?? null,
      status: 'active'
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ProxyRow
}

export async function updateProxy(
  id: string,
  patch: Partial<
    Pick<
      ProxyRow,
      | 'label'
      | 'notes'
      | 'country_code'
      | 'country_name'
      | 'city'
      | 'region'
      | 'timezone'
      | 'last_known_egress_ip'
      | 'last_test_ok'
      | 'last_tested_at'
    >
  >
): Promise<ProxyRow> {
  const { data, error } = await client()
    .from('proxies')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as ProxyRow
}

export async function deleteProxy(id: string): Promise<void> {
  const { error } = await client().from('proxies').delete().eq('id', id)
  if (error) throw error
}

// Count of profiles using this proxy (for the table's "Profiles" column).
export async function countProfilesUsingProxy(proxyId: string): Promise<number> {
  const { count, error } = await client()
    .from('browser_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('proxy_id', proxyId)
  if (error) throw error
  return count ?? 0
}

// Profile numbers for each proxy in a workspace. Returns a map of
// proxy_id → sorted ascending list of profile_numbers. Used by the
// Proxies table to show "#1, #12, #35" instead of just a count.
//
// Single query for the whole workspace — cheaper than one-per-proxy.
// Profiles without a number (rows created before migration 0009) are
// skipped silently rather than rendered as "#null".
export async function listProfileNumbersByProxy(
  workspaceId: string
): Promise<Record<string, number[]>> {
  const { data, error } = await client()
    .from('browser_profiles')
    .select('proxy_id, profile_number')
    .eq('workspace_id', workspaceId)
    .not('proxy_id', 'is', null)
  if (error) throw error
  const out: Record<string, number[]> = {}
  for (const row of (data ?? []) as Array<{ proxy_id: string | null; profile_number: number | null }>) {
    if (!row.proxy_id || row.profile_number == null) continue
    if (!out[row.proxy_id]) out[row.proxy_id] = []
    out[row.proxy_id].push(row.profile_number)
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a - b)
  return out
}
