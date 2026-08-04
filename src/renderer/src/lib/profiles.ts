// Supabase profile data layer. Replaces DEMO_PROFILES.

import { getSupabase, type GhostClient } from '@/lib/supabase'

export interface ProfileRow {
  id: string
  workspace_id: string
  group_id: string | null
  name: string
  fingerprint_seed: number
  platform: string
  platform_version: string | null
  brand: string
  brand_version: string | null
  hardware_concurrency: number | null
  device_memory: number | null
  webgl_vendor: string | null
  webgl_renderer: string | null
  language: string
  timezone: string
  window_width: number | null
  window_height: number | null
  user_agent: string | null
  proxy_type: string | null
  proxy_host: string | null
  proxy_port: number | null
  proxy_user: string | null
  proxy_pass: string | null
  proxy_source: string
  // FK to the workspace proxy this profile draws from (migration 0005).
  // Null for custom-inline proxies and for "no proxy". The proxy_* columns
  // above are the denormalised copy the launcher reads; this column is what
  // "is this proxy already used?" is answered from.
  proxy_id: string | null
  tubeproxies_ip_id: string | null
  notes: string | null
  tags: string[]
  assigned_to: string | null
  enabled_extensions: string[]
  created_by: string | null
  created_at: string
  updated_at: string
  last_opened_at: string | null
  last_opened_by: string | null
  // Concurrent-open lock (Safeguard A)
  open_session_id: string | null
  open_by_user_id: string | null
  open_by_device: string | null
  open_at: string | null
  open_heartbeat_at: string | null
  last_known_egress_ip: string | null
  // Editor-redesign columns (migration 0008). All nullable; null is
  // interpreted as Real / Default / Auto by the flag builder.
  webrtc_mode: string | null
  do_not_track: string | null
  hardware_acceleration: string | null
  disable_tls_features: boolean | null
  launch_args: string | null
  timezone_mode: string | null
  language_mode: string | null
  location_mode: string | null
  location_lat: number | null
  location_lon: number | null
  location_prompt: string | null
  display_language: string | null
  display_language_mode: string | null
  screen_resolution: string | null
  fonts_mode: string | null
  fonts_list: string[] | null
  device_name: string | null
  mac_address: string | null
  noise_canvas: boolean | null
  noise_webgl_image: boolean | null
  noise_audiocontext: boolean | null
  noise_media_device: boolean | null
  noise_clientrects: boolean | null
  noise_speechvoices: boolean | null
  random_fingerprint_on_startup: boolean | null
  cookies_json: string | null
  webgpu_mode: string | null
  // "Google/YouTube Optimized" preset flag (migration 0028). True when the
  // profile matches OPTIMIZED_PRESET; derivable from the fingerprint columns
  // but stored to preserve the editor's toggle intent + restore-on-off.
  google_optimized: boolean | null
  // Workspace-scoped ordinal assigned at INSERT time by trigger. Used
  // by the macOS launcher to pick the per-profile dock icon (slot 1,
  // slot 2, …). Null only on rows created before migration 0009.
  profile_number: number | null
  port_scan_protection: boolean | null
  allowed_ports: string | null
  // Session URL Memory (migration 0012). Tabs open at last close,
  // reopened on next launch. Mirror of the per-device local file owned by
  // the main process; never mixed with user `tags`.
  session_urls: string[] | null
}

function client(): GhostClient {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

// PostgREST default cap: 1000 rows when no Range header is set. We pass an
// explicit .range() so the cap is intentional and we can detect when we've
// hit it. Real pagination lands in Phase 2 alongside bulk operations; for v1
// nobody is expected to hit 1000 profiles in a single workspace (Free=5,
// Pro=100, Team=1000 — Team is the only plan where this could matter).
const PROFILE_PAGE_LIMIT = 1000

export async function listProfiles(workspaceId: string): Promise<ProfileRow[]> {
  const { data, error, count } = await client()
    .from('browser_profiles')
    .select('*', { count: 'estimated' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(0, PROFILE_PAGE_LIMIT - 1)
  if (error) throw error
  if ((count ?? 0) > PROFILE_PAGE_LIMIT) {
    console.warn(
      `[listProfiles] Workspace ${workspaceId} has ${count} profiles but we only loaded ${PROFILE_PAGE_LIMIT}. ` +
        `Add proper pagination — TODO Phase 2.`
    )
  }
  return (data ?? []) as ProfileRow[]
}

export async function getProfile(id: string): Promise<ProfileRow | null> {
  const { data, error } = await client().from('browser_profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as ProfileRow | null) ?? null
}

// The proxy half of a profile row. Written at creation time (single-step
// profile setup) and by assignProxyToProfile() afterwards, so both paths
// produce identical rows.
export interface ProfileProxyFields {
  proxy_id: string | null
  proxy_type: string | null
  proxy_host: string | null
  proxy_port: number | null
  proxy_user: string | null
  proxy_pass: string | null
  proxy_source: string
  tubeproxies_ip_id: string | null
}

export interface NewProfileInput {
  workspace_id: string
  name: string
  group_id?: string | null
  notes?: string | null
  tags?: string[]
  // Optional target OS ('windows' | 'macos' | 'linux'). Used by the importers
  // so a migrated Windows profile gets a coherent Windows fingerprint preset.
  platform?: string | null
  // Optional proxy assigned in the same step as creation. Omit / null to
  // create the profile without a proxy (the pre-existing behaviour).
  proxy?: ProfileProxyFields | null
}

export async function createProfile(input: NewProfileInput): Promise<ProfileRow> {
  // Mirror AdsPower's safe-by-default profile setup: every new profile
  // ships with maximum anti-detect coverage so non-technical users
  // don't have to know which knobs to flip. Mirrors the reference
  // screenshots — Forward WebRTC, Based-on-IP locale, all hardware
  // noise on, port-scan protection enabled, randomized device
  // identity. Everything is overrideable in the editor afterwards.
  //
  // SETTINGS SEAM: the workspace's Fingerprint/Network defaults (Settings →
  // Fingerprint/Network) form the BASELINE. An explicit input.platform (e.g.
  // from an importer migrating a Windows profile) still wins; otherwise the
  // workspace default OS drives the preset. Per-profile randomization is then
  // layered on top so no two devices collide.
  // Only the FINGERPRINT defaults matter at creation time (they shape the
  // stored device). The NETWORK defaults (proxy source, rotate, kill-switch,
  // timeout, retries) are consumed at LAUNCH — see profile-launch.ts /
  // session-manager.ts — so we don't read them here.
  const { getFingerprintDefaults } = await import('@/lib/settings')
  const fpDefaults = await getFingerprintDefaults(input.workspace_id)
  // Map the Settings OS preset key ('win'|'mac') to a platform string.
  const defaultPlatform =
    fpDefaults.os === 'mac' ? 'macos' : fpDefaults.os === 'win' ? 'windows' : undefined
  const platform = input.platform ?? defaultPlatform

  // The platform/brand/UA preset is generated up front so the device
  // name + GPU vendor land coherently with the chosen OS.
  const { generateRandomFingerprint, randomDeviceName, randomMacAddress } =
    await import('@/pages/profile-editor/randomize')
  const fp = generateRandomFingerprint(platform ? { platform } : undefined)
  const { data, error } = await client()
    .from('browser_profiles')
    .insert({
      workspace_id: input.workspace_id,
      name: input.name,
      group_id: input.group_id ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      // Proxy, when the creator picked one in the same step. Spreading
      // nothing leaves the DB defaults (no proxy) exactly as before.
      ...(input.proxy ?? {}),
      // Coherent fingerprint preset
      fingerprint_seed: fp.fingerprint_seed,
      platform: fp.platform,
      platform_version: fp.platform_version,
      brand: fp.brand,
      brand_version: fp.brand_version,
      user_agent: fp.user_agent,
      // CPU cores / RAM default to Real (this machine's value): persist NULL, like
      // WebGL below, so a fresh profile is a coherent real device. A non-null value
      // means the user (or "New fingerprint") explicitly chose Custom.
      hardware_concurrency: null,
      device_memory: null,
      // WebGL metadata defaults to Real (host GPU): persist NULL so the editor
      // shows "Real" as the active state and the launcher reports the genuine
      // GPU. A non-null vendor means the user explicitly picked Custom in the
      // editor (which saves the strings). The randomizer's coherent vendor is
      // only staged client-side for when the user switches to Custom.
      webgl_vendor: null,
      webgl_renderer: null,
      // Use the device archetype's native resolution so a MacBook
      // gets a retina res and a Windows laptop gets 1920×1080.
      screen_resolution: fp.screen_resolution,
      // AdsPower-mirrored locale defaults (proxy-aware at launch).
      timezone_mode: 'based_on_ip',
      timezone: fp.timezone,
      language_mode: 'based_on_ip',
      language: fp.language,
      display_language_mode: 'based_on_language',
      // Privacy maxed — WebRTC mode from the workspace fingerprint default.
      webrtc_mode: fpDefaults.webrtc_mode,
      location_mode: 'based_on_ip',
      location_prompt: 'ask',
      // Hardware noise — all on (per-profile seed → unique noise, consistent
      // per profile). Canvas noise honors the workspace default toggle.
      noise_canvas: fpDefaults.canvas_noise ? fp.noise_canvas : false,
      noise_webgl_image: fp.noise_webgl_image,
      noise_audiocontext: fp.noise_audiocontext,
      noise_media_device: fp.noise_media_device,
      noise_clientrects: fp.noise_clientrects,
      noise_speechvoices: fp.noise_speechvoices,
      // Identity randomized so two new profiles never collide
      device_name: randomDeviceName(fp.platform),
      mac_address: randomMacAddress(),
      // Network-privacy defaults
      port_scan_protection: true,
      // Engine-level WebGPU mirrors WebGL by default (most consistent)
      webgpu_mode: 'based_on_webgl',
      // Not the full "Optimized" preset yet: new profiles ship WebGL=Real
      // (host GPU) which the preset masks to Custom, so the toggle starts
      // OFF and matchesOptimized() agrees. Flipping it on in the editor
      // seeds a coherent Custom GPU.
      google_optimized: false,
      // Fonts: keep system default — Custom is opt-in
      fonts_mode: 'default',
      // Auto-rotate on launch: when the workspace default is on, each launch
      // regenerates a fresh coherent device (honored in profile-launch.ts).
      random_fingerprint_on_startup: fpDefaults.auto_rotate,
      // Advanced flags stay at chromium defaults
      do_not_track: 'default',
      hardware_acceleration: 'default',
      disable_tls_features: false
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ProfileRow
}

export async function updateProfile(
  id: string,
  patch: Partial<
    Pick<
      ProfileRow,
      | 'name'
      | 'notes'
      | 'tags'
      | 'group_id'
      | 'fingerprint_seed'
      | 'platform'
      | 'platform_version'
      | 'brand'
      | 'brand_version'
      | 'hardware_concurrency'
      | 'device_memory'
      | 'webgl_vendor'
      | 'webgl_renderer'
      | 'language'
      | 'timezone'
      | 'window_width'
      | 'window_height'
      | 'user_agent'
      | 'webrtc_mode'
      | 'do_not_track'
      | 'hardware_acceleration'
      | 'disable_tls_features'
      | 'launch_args'
      | 'timezone_mode'
      | 'language_mode'
      | 'location_mode'
      | 'location_lat'
      | 'location_lon'
      | 'location_prompt'
      | 'display_language'
      | 'display_language_mode'
      | 'screen_resolution'
      | 'fonts_mode'
      | 'fonts_list'
      | 'device_name'
      | 'mac_address'
      | 'noise_canvas'
      | 'noise_webgl_image'
      | 'noise_audiocontext'
      | 'noise_media_device'
      | 'noise_clientrects'
      | 'noise_speechvoices'
      | 'random_fingerprint_on_startup'
      | 'cookies_json'
      | 'webgpu_mode'
      | 'google_optimized'
      | 'port_scan_protection'
      | 'allowed_ports'
      | 'session_urls'
      | 'proxy_type'
      | 'proxy_host'
      | 'proxy_port'
      | 'proxy_user'
      | 'proxy_pass'
      | 'proxy_source'
      | 'proxy_id'
      | 'tubeproxies_ip_id'
    >
  >
): Promise<ProfileRow> {
  const { data, error } = await client()
    .from('browser_profiles')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as ProfileRow
}

export async function deleteProfile(id: string): Promise<void> {
  const { error } = await client().from('browser_profiles').delete().eq('id', id)
  if (error) throw error
}

// Copy a workspace proxy onto a profile row. Profiles store the proxy
// inline (denormalised) so the launcher doesn't need a join — see the
// proxy_* columns on profiles. The source proxy stays in the proxies
// table; v1 doesn't enforce one-profile-per-proxy at the DB level
// (that lands with the TubeProxies dashboard integration in Phase 4).
export async function assignProxyToProfile(
  profileId: string,
  proxy: {
    id: string
    proxy_type: string
    host: string
    port: number
    username: string | null
    password_encrypted: string | null
    source: string
    tubeproxies_ip_id: string | null
  }
): Promise<ProfileRow> {
  return updateProfile(profileId, {
    // proxy_id is a FK to ghost.proxies, which holds CUSTOM proxies only —
    // purchased proxies are read live from TubeProxies and have no ghost row
    // to reference. Their linkage is tubeproxies_ip_id (set below), which the
    // usage lookups key on alongside proxy_id.
    proxy_id: proxy.source === 'custom' ? proxy.id : null,
    proxy_type: proxy.proxy_type,
    proxy_host: proxy.host,
    proxy_port: proxy.port,
    proxy_user: proxy.username,
    proxy_pass: proxy.password_encrypted,
    proxy_source: proxy.source,
    tubeproxies_ip_id: proxy.tubeproxies_ip_id
  })
}

export async function clearProfileProxy(profileId: string): Promise<ProfileRow> {
  return updateProfile(profileId, {
    proxy_id: null,
    proxy_type: null,
    proxy_host: null,
    proxy_port: null,
    proxy_user: null,
    proxy_pass: null,
    proxy_source: 'custom',
    tubeproxies_ip_id: null
  })
}

// Bulk ops. Each issues N independent updates / deletes through
// PostgREST so RLS evaluates per-row — same authorisation surface as
// the single-row paths. Caller is expected to gate the UI on the
// matching permission ('profiles.edit' / 'profiles.delete' / etc.)
// before invoking; an unauthorised user hitting these via DevTools
// gets the same RLS rejection per row.
//
// `BulkResult` returns counts so the renderer can show "5 of 7
// updated" toasts when some rows fail (e.g. locks held by others).

export interface BulkResult {
  ok: number
  failed: number
  errors: string[]
}

async function runBulk<T>(ids: string[], op: (id: string) => Promise<T>): Promise<BulkResult> {
  const results = await Promise.allSettled(ids.map((id) => op(id)))
  const errors: string[] = []
  let ok = 0
  let failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled') ok += 1
    else {
      failed += 1
      errors.push((r.reason as Error)?.message ?? 'unknown')
    }
  }
  return { ok, failed, errors }
}

export async function bulkDeleteProfiles(ids: string[]): Promise<BulkResult> {
  return runBulk(ids, async (id) => {
    await deleteProfile(id)
  })
}

export async function bulkMoveToGroup(ids: string[], groupId: string | null): Promise<BulkResult> {
  return runBulk(ids, async (id) => {
    await updateProfile(id, { group_id: groupId })
  })
}

// Add tags to N profiles, deduping client-side per row. Reads the
// current tags first so we don't clobber the row's existing set.
export async function bulkAddTags(ids: string[], tagsToAdd: string[]): Promise<BulkResult> {
  const trimmed = [...new Set(tagsToAdd.map((t) => t.trim()).filter(Boolean))]
  if (trimmed.length === 0) return { ok: 0, failed: 0, errors: [] }
  return runBulk(ids, async (id) => {
    const row = await getProfile(id)
    if (!row) throw new Error('Profile not found')
    const next = [...new Set([...(row.tags ?? []), ...trimmed])]
    if (next.length === (row.tags?.length ?? 0)) return // no-op
    await updateProfile(id, { tags: next })
  })
}

export async function bulkRemoveTags(ids: string[], tagsToRemove: string[]): Promise<BulkResult> {
  const drop = new Set(tagsToRemove.map((t) => t.trim()).filter(Boolean))
  if (drop.size === 0) return { ok: 0, failed: 0, errors: [] }
  return runBulk(ids, async (id) => {
    const row = await getProfile(id)
    if (!row) throw new Error('Profile not found')
    const next = (row.tags ?? []).filter((t) => !drop.has(t))
    if (next.length === (row.tags?.length ?? 0)) return // no-op
    await updateProfile(id, { tags: next })
  })
}

// Workspace-wide tag rename: rewrites the tag in every profile that
// currently has it. Done client-side rather than via a server RPC
// because (a) the volume is small (Free=5, Pro=100, Team=1000), and
// (b) RLS already evaluates per-row writes correctly. If we ever hit
// scale issues we can move this to a SECURITY DEFINER RPC.
export async function renameTagInWorkspace(
  workspaceId: string,
  from: string,
  to: string
): Promise<BulkResult> {
  const fromTrim = from.trim()
  const toTrim = to.trim()
  if (!fromTrim || !toTrim || fromTrim === toTrim) {
    return { ok: 0, failed: 0, errors: [] }
  }
  const { data, error } = await client()
    .from('browser_profiles')
    .select('id, tags')
    .eq('workspace_id', workspaceId)
    .contains('tags', [fromTrim])
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; tags: string[] | null }>
  return runBulk(
    rows.map((r) => r.id),
    async (id) => {
      const row = rows.find((r) => r.id === id)
      if (!row) return
      const set = new Set(row.tags ?? [])
      set.delete(fromTrim)
      set.add(toTrim)
      await updateProfile(id, { tags: [...set] })
    }
  )
}

// Copy a profile's fingerprint + proxy + tags into a new row with a
// fresh seed. Lock + audit columns are NOT copied — the new row
// starts unopened.
export async function duplicateProfile(id: string): Promise<ProfileRow> {
  const src = await getProfile(id)
  if (!src) throw new Error('Profile not found')
  const { generateRandomFingerprint } = await import('@/pages/profile-editor/randomize')
  const fp = generateRandomFingerprint({ platform: src.platform })

  const newName = (src.name + ' (copy)').slice(0, 100)
  // Build the insert payload from the source row, but:
  //  - new fingerprint_seed (so canvas/audio noise differs)
  //  - new device_name + mac_address
  //  - drop lock + audit columns
  const { data, error } = await client()
    .from('browser_profiles')
    .insert({
      workspace_id: src.workspace_id,
      group_id: src.group_id,
      name: newName,
      notes: src.notes,
      tags: src.tags,
      // Fingerprint copied — keep platform, brand, GPU etc.
      fingerprint_seed: fp.fingerprint_seed,
      platform: src.platform,
      platform_version: src.platform_version,
      brand: src.brand,
      brand_version: src.brand_version,
      hardware_concurrency: src.hardware_concurrency,
      device_memory: src.device_memory,
      webgl_vendor: src.webgl_vendor,
      webgl_renderer: src.webgl_renderer,
      language: src.language,
      timezone: src.timezone,
      window_width: src.window_width,
      window_height: src.window_height,
      user_agent: src.user_agent,
      screen_resolution: src.screen_resolution,
      timezone_mode: src.timezone_mode,
      language_mode: src.language_mode,
      webrtc_mode: src.webrtc_mode,
      webgpu_mode: src.webgpu_mode,
      noise_canvas: src.noise_canvas,
      noise_webgl_image: src.noise_webgl_image,
      noise_audiocontext: src.noise_audiocontext,
      noise_media_device: src.noise_media_device,
      noise_clientrects: src.noise_clientrects,
      noise_speechvoices: src.noise_speechvoices,
      // Proxy copied verbatim
      proxy_type: src.proxy_type,
      proxy_host: src.proxy_host,
      proxy_port: src.proxy_port,
      proxy_user: src.proxy_user,
      proxy_pass: src.proxy_pass,
      proxy_source: src.proxy_source,
      proxy_id: src.proxy_id,
      // Identity randomized — two profiles must look like distinct
      // devices even when fingerprint is otherwise the same
      device_name: null,
      mac_address: null,
      // Advanced flags copied
      do_not_track: src.do_not_track,
      hardware_acceleration: src.hardware_acceleration,
      disable_tls_features: src.disable_tls_features,
      launch_args: src.launch_args,
      port_scan_protection: src.port_scan_protection,
      allowed_ports: src.allowed_ports
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ProfileRow
}

// Sanitized JSON export of a profile. Strips proxy_pass + lock +
// audit columns by default; the includeSecrets flag opts those back
// in for moves between user-trusted machines.
export async function exportProfile(
  id: string,
  opts?: { includeSecrets?: boolean }
): Promise<string> {
  const p = await getProfile(id)
  if (!p) throw new Error('Profile not found')
  const exportable: Record<string, unknown> = { ...p }
  // Always strip lock + audit + identifiers
  delete exportable.id
  delete exportable.workspace_id
  delete exportable.created_at
  delete exportable.updated_at
  delete exportable.created_by
  delete exportable.last_opened_at
  delete exportable.last_opened_by
  delete exportable.open_session_id
  delete exportable.open_by_user_id
  delete exportable.open_by_device
  delete exportable.open_at
  delete exportable.open_heartbeat_at
  delete exportable.last_known_egress_ip
  delete exportable.profile_number
  delete exportable.tubeproxies_ip_id
  // Workspace-local FK — meaningless in the importing workspace.
  delete exportable.proxy_id
  delete exportable.assigned_to
  if (!opts?.includeSecrets) delete exportable.proxy_pass
  return JSON.stringify(
    { _format: 'tubeproxies-profile', _version: 1, profile: exportable },
    null,
    2
  )
}

// Import a previously-exported profile JSON into the given workspace.
// Returns the new row. Validates the envelope; ignores unknown keys.
export async function importProfile(json: string, workspaceId: string): Promise<ProfileRow> {
  let parsed: { _format?: string; profile?: Record<string, unknown> }
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON')
  }
  if (parsed._format !== 'tubeproxies-profile' || !parsed.profile) {
    throw new Error(
      'Not a TubeGhost profile export — for a CSV or another browser’s export, ' +
        'use the matching entry in the Import menu'
    )
  }
  const p = parsed.profile
  // Whitelist insertable columns to avoid any sneaky overrides.
  const allowed: Array<keyof ProfileRow> = [
    'name',
    'notes',
    'tags',
    'fingerprint_seed',
    'platform',
    'platform_version',
    'brand',
    'brand_version',
    'hardware_concurrency',
    'device_memory',
    'webgl_vendor',
    'webgl_renderer',
    'language',
    'timezone',
    'window_width',
    'window_height',
    'user_agent',
    'proxy_type',
    'proxy_host',
    'proxy_port',
    'proxy_user',
    'proxy_pass',
    'proxy_source',
    'webrtc_mode',
    'do_not_track',
    'hardware_acceleration',
    'disable_tls_features',
    'launch_args',
    'timezone_mode',
    'language_mode',
    'location_mode',
    'location_lat',
    'location_lon',
    'location_prompt',
    'display_language',
    'display_language_mode',
    'screen_resolution',
    'fonts_mode',
    'fonts_list',
    'device_name',
    'mac_address',
    'noise_canvas',
    'noise_webgl_image',
    'noise_audiocontext',
    'noise_media_device',
    'noise_clientrects',
    'noise_speechvoices',
    'random_fingerprint_on_startup',
    'cookies_json',
    'webgpu_mode',
    // Editor toggle state — without it a re-imported profile shows the
    // "Google/YouTube Optimized" switch off despite carrying the preset.
    'google_optimized',
    // NOTE: group_id and enabled_extensions are deliberately NOT restored —
    // both are workspace-local ids that would dangle (or point at a stranger's
    // row) when the export lands in a different workspace.
    'port_scan_protection',
    'allowed_ports'
  ]
  const insert: Record<string, unknown> = { workspace_id: workspaceId }
  for (const k of allowed) {
    if (k in p) insert[k] = p[k]
  }
  if (!insert.name) insert.name = 'Imported profile'
  if (typeof insert.fingerprint_seed !== 'number') {
    insert.fingerprint_seed = Math.floor(Math.random() * 2_147_483_647)
  }
  const { data, error } = await client().from('browser_profiles').insert(insert).select('*').single()
  if (error) throw error
  return data as ProfileRow
}

// Distinct tags across all profiles in a workspace. Tags are an inline
// text[] column on profiles, not a separate table — so we read them all
// and dedupe client-side. Cheap enough at v1 scale (Free=5, Pro=100,
// Team=1000 profiles per workspace). Re-fetch on profile editor mount.
export async function listWorkspaceTags(workspaceId: string): Promise<string[]> {
  const { data, error } = await client()
    .from('browser_profiles')
    .select('tags')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  const all = new Set<string>()
  for (const row of (data ?? []) as Array<{ tags: string[] | null }>) {
    for (const t of row.tags ?? []) {
      const trimmed = t.trim()
      if (trimmed) all.add(trimmed)
    }
  }
  return [...all].sort((a, b) => a.localeCompare(b))
}
