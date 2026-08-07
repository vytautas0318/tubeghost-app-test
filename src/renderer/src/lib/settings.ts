// Workspace-scope Settings data layer: general defaults, fingerprint defaults,
// and network defaults. All writes require the `workspace.edit_settings`
// permission (RLS-enforced on the workspaces UPDATE policy).
//
// getFingerprintDefaults() / getNetworkDefaults() are the ENGINE SEAM: read by
// lib/profiles.ts createProfile() so a new profile inherits the workspace
// baseline (still overrideable per profile in the editor).

import { getSupabase, type GhostClient } from '@/lib/supabase'

function client(): GhostClient {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

// ── Types ──────────────────────────────────────────────────────────────────

export type LaunchBehavior = 'window' | 'tab' | 'headless'
export type WebrtcMode = 'forward' | 'replace' | 'real' | 'disabled'
export type ProxySource = 'pool' | 'custom' | 'none'

export interface FingerprintDefaults {
  os: string // 'win' | 'mac' — a preset key, expanded to a platform at creation
  browser_core: string // e.g. '150'
  webrtc_mode: WebrtcMode
  canvas_noise: boolean
  auto_rotate: boolean // regenerate a fresh fingerprint on each launch
}

export interface NetworkDefaults {
  proxy_source: ProxySource
  rotate_on_launch: boolean
  kill_switch: boolean
  timeout_seconds: number
  max_retries: number
}

// Automation engine defaults: concurrency cap, per-profile/account safety
// caps (§8/§10), and the third-party captcha solver config (§9). Stored as a
// jsonb column on `workspaces` (mirrors network_defaults). Captcha API key is
// NOT a hard app-wide secret — it's the workspace's own solver credit; storing
// it on the workspace row (RLS-gated by workspace.edit_settings) is acceptable.
export interface AutomationDefaults {
  concurrency: number // max profiles running in parallel per automation run
  max_engagement_per_run: number
  max_engagement_per_day: number
  min_profile_stagger_seconds: number
  captcha_provider: string | null // e.g. '2captcha'
  captcha_api_key: string | null
}

export const RECOMMENDED_AUTOMATION: AutomationDefaults = {
  concurrency: 3,
  max_engagement_per_run: 10,
  max_engagement_per_day: 40,
  min_profile_stagger_seconds: 3,
  captcha_provider: null,
  captcha_api_key: null
}

function coerceAutomation(raw: unknown): AutomationDefaults {
  const o = (raw ?? {}) as Partial<AutomationDefaults>
  return {
    concurrency: o.concurrency ?? RECOMMENDED_AUTOMATION.concurrency,
    max_engagement_per_run:
      o.max_engagement_per_run ?? RECOMMENDED_AUTOMATION.max_engagement_per_run,
    max_engagement_per_day:
      o.max_engagement_per_day ?? RECOMMENDED_AUTOMATION.max_engagement_per_day,
    min_profile_stagger_seconds:
      o.min_profile_stagger_seconds ?? RECOMMENDED_AUTOMATION.min_profile_stagger_seconds,
    captcha_provider: o.captcha_provider ?? null,
    captcha_api_key: o.captcha_api_key ?? null
  }
}

export async function getAutomationDefaults(workspaceId: string): Promise<AutomationDefaults> {
  const c = getSupabase()
  if (!c) return RECOMMENDED_AUTOMATION
  const { data, error } = await c
    .from('workspaces')
    .select('automation_defaults')
    .eq('id', workspaceId)
    .maybeSingle()
  if (error || !data) return RECOMMENDED_AUTOMATION
  return coerceAutomation((data as { automation_defaults?: unknown }).automation_defaults)
}

export async function updateAutomationDefaults(
  workspaceId: string,
  defaults: AutomationDefaults
): Promise<void> {
  const { error } = await client()
    .from('workspaces')
    .update({ automation_defaults: defaults })
    .eq('id', workspaceId)
  if (error) throw error
}

export interface WorkspaceSettings {
  name: string
  default_launch_behavior: LaunchBehavior
  default_group_id: string | null
  interface_language: string
  fingerprint_defaults: FingerprintDefaults
  network_defaults: NetworkDefaults
  require_2fa: boolean
  session_timeout_hours: number
}

// ── Recommended baselines (the "Reset to recommended" targets) ──────────────

export const RECOMMENDED_FINGERPRINT: FingerprintDefaults = {
  os: 'win',
  browser_core: '150',
  webrtc_mode: 'forward',
  canvas_noise: true,
  auto_rotate: false
}

export const RECOMMENDED_NETWORK: NetworkDefaults = {
  proxy_source: 'pool',
  rotate_on_launch: false,
  kill_switch: true,
  timeout_seconds: 30,
  max_retries: 3
}

// Coerce a possibly-partial jsonb blob into a fully-populated, valid shape.
function coerceFingerprint(raw: unknown): FingerprintDefaults {
  const o = (raw ?? {}) as Partial<FingerprintDefaults>
  return {
    os: o.os ?? RECOMMENDED_FINGERPRINT.os,
    browser_core: o.browser_core ?? RECOMMENDED_FINGERPRINT.browser_core,
    webrtc_mode: o.webrtc_mode ?? RECOMMENDED_FINGERPRINT.webrtc_mode,
    canvas_noise: o.canvas_noise ?? RECOMMENDED_FINGERPRINT.canvas_noise,
    auto_rotate: o.auto_rotate ?? RECOMMENDED_FINGERPRINT.auto_rotate
  }
}

function coerceNetwork(raw: unknown): NetworkDefaults {
  const o = (raw ?? {}) as Partial<NetworkDefaults>
  return {
    proxy_source: o.proxy_source ?? RECOMMENDED_NETWORK.proxy_source,
    rotate_on_launch: o.rotate_on_launch ?? RECOMMENDED_NETWORK.rotate_on_launch,
    kill_switch: o.kill_switch ?? RECOMMENDED_NETWORK.kill_switch,
    timeout_seconds: o.timeout_seconds ?? RECOMMENDED_NETWORK.timeout_seconds,
    max_retries: o.max_retries ?? RECOMMENDED_NETWORK.max_retries
  }
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings> {
  const { data, error } = await client()
    .from('workspaces')
    .select(
      'name, default_launch_behavior, default_group_id, interface_language, ' +
        'fingerprint_defaults, network_defaults, require_2fa, session_timeout_hours'
    )
    .eq('id', workspaceId)
    .single()
  if (error) throw error
  const r = data as unknown as Record<string, unknown>
  return {
    name: (r.name as string) ?? '',
    default_launch_behavior: (r.default_launch_behavior as LaunchBehavior) ?? 'window',
    default_group_id: (r.default_group_id as string | null) ?? null,
    interface_language: (r.interface_language as string) ?? 'en',
    fingerprint_defaults: coerceFingerprint(r.fingerprint_defaults),
    network_defaults: coerceNetwork(r.network_defaults),
    require_2fa: (r.require_2fa as boolean) ?? false,
    session_timeout_hours: (r.session_timeout_hours as number) ?? 24
  }
}

// The engine seam: minimal getters used by createProfile(). Return the
// recommended baseline if Supabase is unavailable (demo mode) so profile
// creation never breaks.
export async function getFingerprintDefaults(workspaceId: string): Promise<FingerprintDefaults> {
  const c = getSupabase()
  if (!c) return RECOMMENDED_FINGERPRINT
  const { data, error } = await c
    .from('workspaces')
    .select('fingerprint_defaults')
    .eq('id', workspaceId)
    .maybeSingle()
  if (error || !data) return RECOMMENDED_FINGERPRINT
  return coerceFingerprint((data as { fingerprint_defaults?: unknown }).fingerprint_defaults)
}

export async function getNetworkDefaults(workspaceId: string): Promise<NetworkDefaults> {
  const c = getSupabase()
  if (!c) return RECOMMENDED_NETWORK
  const { data, error } = await c
    .from('workspaces')
    .select('network_defaults')
    .eq('id', workspaceId)
    .maybeSingle()
  if (error || !data) return RECOMMENDED_NETWORK
  return coerceNetwork((data as { network_defaults?: unknown }).network_defaults)
}

// ── Writes ─────────────────────────────────────────────────────────────────

// Update general workspace settings (name / launch / group / language /
// policies). Billing columns are impossible here — the trigger blocks them.
export async function updateWorkspaceGeneral(
  workspaceId: string,
  patch: Partial<
    Pick<
      WorkspaceSettings,
      | 'name'
      | 'default_launch_behavior'
      | 'default_group_id'
      | 'interface_language'
      | 'require_2fa'
      | 'session_timeout_hours'
    >
  >
): Promise<void> {
  const { error } = await client().from('workspaces').update(patch).eq('id', workspaceId)
  if (error) throw error
}

export async function updateFingerprintDefaults(
  workspaceId: string,
  defaults: FingerprintDefaults
): Promise<void> {
  const { error } = await client()
    .from('workspaces')
    .update({ fingerprint_defaults: defaults })
    .eq('id', workspaceId)
  if (error) throw error
}

export async function updateNetworkDefaults(
  workspaceId: string,
  defaults: NetworkDefaults
): Promise<void> {
  const { error } = await client()
    .from('workspaces')
    .update({ network_defaults: defaults })
    .eq('id', workspaceId)
  if (error) throw error
}
