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

// Custom (user-entered) proxies. Since the live-read cutover these are the
// ONLY rows ghost.proxies holds — purchased proxies are never copied here.
async function listCustomProxies(workspaceId: string): Promise<ProxyRow[]> {
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

// Attach the signed-in user's purchased proxies to this workspace's pool.
//
// A purchase becomes visible to a WORKSPACE (not just to its buyer) by
// having an attachment row — that is what makes team sharing work, so an
// invited admin sees the proxies the owner contributed. This replaces the
// old sync's implicit contribution: its INSERT into ghost.proxies carried a
// workspace_id, so whoever synced shared their purchases with that
// workspace.
//
// Idempotent and cheap; returns how many were newly attached. Requires
// proxies.create server-side, so a view-only member never contributes.
export async function attachMyPurchasedProxies(workspaceId: string): Promise<number> {
  const { data, error } = await client().rpc('attach_my_purchased_proxies', {
    p_workspace_id: workspaceId
  })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

// The workspace's purchased proxies, read LIVE from TubeProxies' own tables
// (public.proxies ⋈ public.proxy_inventory) through a SECURITY DEFINER RPC.
// There is no copy and no sync step, so status and expiry are whatever
// TubeProxies says at this moment.
//
// Scoped by ATTACHMENT, not by the caller's identity: this returns every
// purchase attached to the workspace, whoever bought it.
//
// Returns ACTIVE and EXPIRED rows. Expired purchased proxies are kept
// visible on purpose (decision 2026-08-04): they are never deleted, so the
// user must be able to see that one lapsed rather than have it disappear.
// Consumers must therefore never assume a row is usable — check `status`
// before assigning one to a profile.
//
// Row id is the TubeProxies assignment id (public.proxies.id). label /
// notes / test telemetry come from ghost.proxy_annotations, joined in by
// the RPC.
export async function listPurchasedProxies(workspaceId: string): Promise<ProxyRow[]> {
  const { data, error } = await client().rpc('list_my_purchased_proxies', {
    p_workspace_id: workspaceId
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as ProxyRow[]
}

// The workspace's full proxy list: live purchased rows + custom rows, in one
// shape. Every consumer (Proxies page, profile pickers, assistant) goes
// through here, so neither source can be forgotten at a call site.
export async function listProxies(workspaceId: string): Promise<ProxyRow[]> {
  const [purchased, custom] = await Promise.all([
    listPurchasedProxies(workspaceId),
    listCustomProxies(workspaceId)
  ])
  return [...purchased, ...custom]
}

// All CUSTOM proxies visible to the current user regardless of the active
// workspace. RLS on ghost.proxies returns exactly the rows the caller may
// see across their workspaces, so the workspace_id filter is omitted.
//
// Purchased proxies are deliberately not included: the live read is
// workspace-scoped (the RPC takes a workspace id and checks membership).
export async function listMyProxies(): Promise<ProxyRow[]> {
  const { data, error } = await client()
    .from('proxies')
    .select('*')
    .order('created_at', { ascending: false })
    .range(0, PROXY_PAGE_LIMIT - 1)
  if (error) throw error
  return (data ?? []) as ProxyRow[]
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

// Insert a custom (non-TubeProxies) proxy. Purchased proxies are never
// inserted here — they are read live from TubeProxies' tables.
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

export type ProxyPatch = Partial<
  Pick<
    ProxyRow,
    | 'label'
    | 'notes'
    | 'proxy_type'
    | 'host'
    | 'port'
    | 'username'
    | 'password_encrypted'
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

// Update a CUSTOM proxy row in ghost.proxies. Purchased proxies no longer
// live there — use updateProxyRow(), which routes by source.
export async function updateProxy(id: string, patch: ProxyPatch): Promise<ProxyRow> {
  const { data, error } = await client()
    .from('proxies')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as ProxyRow
}

// Ghost-side annotations for a purchased proxy. The connection data itself
// (host, port, credentials, geo) is TubeProxies-owned and read-only here,
// so only the ghost-owned fields are written.
async function upsertProxyAnnotation(
  workspaceId: string,
  tubeproxiesProxyId: string,
  patch: ProxyPatch
): Promise<void> {
  const { error } = await client()
    .from('proxy_annotations')
    .upsert(
      {
        workspace_id: workspaceId,
        tubeproxies_proxy_id: tubeproxiesProxyId,
        ...(patch.label !== undefined && { label: patch.label }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
        ...(patch.last_known_egress_ip !== undefined && {
          last_known_egress_ip: patch.last_known_egress_ip
        }),
        ...(patch.last_test_ok !== undefined && { last_test_ok: patch.last_test_ok }),
        ...(patch.last_tested_at !== undefined && { last_tested_at: patch.last_tested_at }),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'workspace_id,tubeproxies_proxy_id' }
    )
  if (error) throw error
}

// Patch any proxy, routing by source: custom rows update ghost.proxies;
// purchased rows write only their ghost-side annotation. Geo fields in the
// patch are ignored for purchased rows — TubeProxies owns those.
// Returns the row with the patch applied so callers can update local state.
export async function updateProxyRow(row: ProxyRow, patch: ProxyPatch): Promise<ProxyRow> {
  if (row.source === 'custom') return updateProxy(row.id, patch)
  const { label, notes, last_known_egress_ip, last_test_ok, last_tested_at } = patch
  await upsertProxyAnnotation(row.workspace_id, row.id, {
    label,
    notes,
    last_known_egress_ip,
    last_test_ok,
    last_tested_at
  })
  return { ...row, ...patch }
}

// Edit a custom proxy's connection details, then re-snapshot the change onto
// every profile bound to it.
//
// browser_profiles carries a denormalised copy of the connection (proxy_host,
// proxy_port, proxy_user, proxy_pass) so a launch does not need a join. That
// copy goes stale the moment the proxy is edited, so the profiles are updated
// in the same call — otherwise a profile keeps dialling the old host.
export async function updateCustomProxyConnection(
  row: ProxyRow,
  patch: ProxyPatch
): Promise<{ proxy: ProxyRow; profilesUpdated: number }> {
  if (row.source !== 'custom') {
    throw new Error('Only custom proxies can have their connection edited.')
  }
  const proxy = await updateProxy(row.id, patch)

  // Best-effort: the proxy edit itself has already committed, so a failure
  // here must not present as "nothing happened". Caller surfaces the count.
  let profilesUpdated = 0
  try {
    const { data, error } = await client()
      .from('browser_profiles')
      .update({
        proxy_type: proxy.proxy_type,
        proxy_host: proxy.host,
        proxy_port: proxy.port,
        proxy_user: proxy.username,
        proxy_pass: proxy.password_encrypted
      })
      .eq('proxy_id', proxy.id)
      .select('id')
    if (error) throw error
    profilesUpdated = data?.length ?? 0
  } catch {
    /* proxy saved; profiles keep their old snapshot until reassigned */
  }
  return { proxy, profilesUpdated }
}

// Delete a CUSTOM proxy. Purchased proxies cannot be deleted from here —
// they belong to the user's TubeProxies subscription and are cancelled
// there; nothing local exists to remove.
export async function deleteProxy(id: string): Promise<void> {
  const { error } = await client().from('proxies').delete().eq('id', id)
  if (error) throw error
}

// Count of profiles using this proxy (for the table's "Profiles" column).
// Custom proxies are linked by browser_profiles.proxy_id; purchased ones by
// tubeproxies_ip_id, since they have no ghost.proxies row to point at.
export async function countProfilesUsingProxy(
  proxyId: string,
  tubeproxiesIpId?: string | null
): Promise<number> {
  // Drafts excluded: an editor session that assigned this proxy but was never
  // saved would otherwise inflate the count with a profile the user can't see.
  const q = client()
    .from('browser_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_draft', false)
  const { count, error } = await (tubeproxiesIpId
    ? q.or(`proxy_id.eq.${proxyId},tubeproxies_ip_id.eq.${tubeproxiesIpId}`)
    : q.eq('proxy_id', proxyId))
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
// `proxies` is optional but strongly recommended: pass the workspace's proxy
// rows so assignments can be resolved by tubeproxies_ip_id and by
// host:port too. Both matter now —
//   * PURCHASED proxies have no ghost.proxies row, so profiles link to them
//     via tubeproxies_ip_id, never proxy_id;
//   * LEGACY assignments (saved before proxy_id was written) carry only the
//     denormalised proxy_host/proxy_port.
// Without the rows those profiles look unassigned and their proxy reads as
// unused — which would let auto-assign hand the same proxy out twice.
export async function listProfileNumbersByProxy(
  workspaceId: string,
  proxies?: ProxyRow[]
): Promise<Record<string, number[]>> {
  const { data, error } = await client()
    .from('browser_profiles')
    .select('proxy_id, tubeproxies_ip_id, proxy_host, proxy_port, profile_number')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  const byHostPort = new Map<string, string>()
  const byTubeproxiesIp = new Map<string, string>()
  for (const p of proxies ?? []) {
    byHostPort.set(`${p.host}:${p.port}`, p.id)
    if (p.tubeproxies_ip_id) byTubeproxiesIp.set(p.tubeproxies_ip_id, p.id)
  }

  const out: Record<string, number[]> = {}
  const rows = (data ?? []) as Array<{
    proxy_id: string | null
    tubeproxies_ip_id: string | null
    proxy_host: string | null
    proxy_port: number | null
    profile_number: number | null
  }>
  for (const row of rows) {
    const id =
      row.proxy_id ??
      (row.tubeproxies_ip_id ? byTubeproxiesIp.get(row.tubeproxies_ip_id) : undefined) ??
      (row.proxy_host && row.proxy_port != null
        ? byHostPort.get(`${row.proxy_host}:${row.proxy_port}`)
        : undefined)
    if (!id || row.profile_number == null) continue
    if (!out[id]) out[id] = []
    out[id].push(row.profile_number)
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a - b)
  return out
}

// Proxies in the workspace that no profile is using yet, best candidate
// first — tested-OK before untested before failed, then by proxy number so
// repeated auto-picks walk the pool in a predictable order.
//
// Powers the "auto-assign an unused proxy" mode of profile creation
// (AdsPower parity). Only `active` proxies are eligible: expired / released
// / errored ones would hand the new profile a dead egress.
export async function listUnusedProxies(workspaceId: string): Promise<ProxyRow[]> {
  const rows = await listProxies(workspaceId)
  const usage = await listProfileNumbersByProxy(workspaceId, rows)
  const score = (r: ProxyRow): number =>
    r.last_test_ok === true ? 0 : r.last_test_ok === null ? 1 : 2
  return rows
    .filter((r) => r.status === 'active' && (usage[r.id]?.length ?? 0) === 0)
    .sort((a, b) => {
      const s = score(a) - score(b)
      if (s !== 0) return s
      return (a.proxy_number ?? Number.MAX_SAFE_INTEGER) - (b.proxy_number ?? Number.MAX_SAFE_INTEGER)
    })
}

// Single best unused proxy, or null when the pool is exhausted. Callers
// decide whether "no proxy available" is an error or a soft skip.
export async function pickUnusedProxy(workspaceId: string): Promise<ProxyRow | null> {
  return (await listUnusedProxies(workspaceId))[0] ?? null
}
