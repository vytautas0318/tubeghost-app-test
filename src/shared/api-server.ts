// Shared types for the Local REST API + AI MCP feature. Imported by the
// main-process server/store, the preload bridge, the renderer settings UI, and
// the MCP subcommand — so the contract lives in exactly one place.
//
// Architecture (see docs/api-mcp.md): the REST server runs in the MAIN process
// but all Supabase-backed data logic lives in the renderer, so most routes
// forward over an IPC bridge to the renderer's lib/*.ts services. Config + API
// keys persist LOCALLY (<userData>/api-config.json) so the `tubeghost mcp`
// subcommand and the server itself can read them without a Supabase login.

// ── Scopes ────────────────────────────────────────────────────────────────
// A key carries a set of scopes. `full` implies all others. Each route/tool
// declares the scope it requires; the server checks it independently of the
// client (never trust the caller's advertised capabilities).
export type Scope = 'profiles:read' | 'profiles:write' | 'automation' | 'sensitive' | 'full'

export const ALL_SCOPES: Scope[] = [
  'profiles:read',
  'profiles:write',
  'automation',
  'sensitive',
  'full'
]

// ── Tools (the MCP surface; names MUST match the settings UI + mockup) ──────
export type ToolId =
  | 'list_profiles'
  | 'launch_profile'
  | 'stop_profile'
  | 'create_profile'
  | 'run_automation'
  | 'get_profile_cookies'
  | 'get_2fa_code'

export type ToolLevel = 'read' | 'write' | 'sensitive'

export interface ToolDef {
  id: ToolId
  desc: string
  level: ToolLevel
  // The scope a caller needs to invoke this tool / its REST route.
  scope: Scope
}

// Canonical tool catalog. `enabledByDefault` encodes the mockup's "5 of 7
// enabled": read + write ON, the two sensitive tools OFF.
export const TOOL_CATALOG: Array<ToolDef & { enabledByDefault: boolean }> = [
  {
    id: 'list_profiles',
    desc: 'Enumerate profiles, groups, and status',
    level: 'read',
    scope: 'profiles:read',
    enabledByDefault: true
  },
  {
    id: 'launch_profile',
    desc: 'Open a profile session (optionally headless)',
    level: 'write',
    scope: 'profiles:write',
    enabledByDefault: true
  },
  {
    id: 'stop_profile',
    desc: 'Close a running profile session',
    level: 'write',
    scope: 'profiles:write',
    enabledByDefault: true
  },
  {
    id: 'create_profile',
    desc: 'Spin up a new profile with a fresh fingerprint',
    level: 'write',
    scope: 'profiles:write',
    enabledByDefault: true
  },
  {
    id: 'run_automation',
    desc: 'Trigger a saved no-code flow inside a profile',
    level: 'write',
    scope: 'automation',
    enabledByDefault: true
  },
  {
    id: 'get_profile_cookies',
    desc: 'Read stored cookies & session state',
    level: 'sensitive',
    scope: 'sensitive',
    enabledByDefault: false
  },
  {
    id: 'get_2fa_code',
    desc: 'Return a live authenticator code for an account',
    level: 'sensitive',
    scope: 'sensitive',
    enabledByDefault: false
  }
]

// ── Persisted config shape (<userData>/api-config.json) ─────────────────────
export interface ApiKeyRecord {
  id: string
  name: string
  // scrypt hash of the plaintext key. The plaintext is shown to the user ONCE
  // at creation and never stored. `mask` is a display-only preview
  // (tg_live_••••••••2f9a). `salt` is the per-key scrypt salt (hex).
  hash: string
  salt: string
  mask: string
  scopes: Scope[]
  createdAt: string
  lastUsedAt: string | null
}

export interface ApiServerConfig {
  enabled: boolean
  port: number
  rateLimitPerMin: number
  // Require X-Confirm on destructive API calls (delete_profile). Default true.
  requireConfirmDestructive: boolean
  // Opt-in: expose the MCP endpoint via a public https tunnel so claude.ai's
  // *web* connector can reach it (Claude Desktop / Cursor use the local URL and
  // don't need this). OFF by default — it publishes a Bearer-gated public URL.
  webConnectorEnabled: boolean
  tools: Record<ToolId, boolean>
  keys: ApiKeyRecord[]
}

export const API_VERSION = 'v1'
export const DEFAULT_PORT = 7891
export const DEFAULT_RATE_LIMIT = 120
export const KEY_PREFIX = 'tg_live_'

export function defaultTools(): Record<ToolId, boolean> {
  const out = {} as Record<ToolId, boolean>
  for (const t of TOOL_CATALOG) out[t.id] = t.enabledByDefault
  return out
}

export function defaultConfig(): ApiServerConfig {
  return {
    enabled: false,
    port: DEFAULT_PORT,
    rateLimitPerMin: DEFAULT_RATE_LIMIT,
    requireConfirmDestructive: true,
    webConnectorEnabled: false,
    tools: defaultTools(),
    keys: []
  }
}

// True if the key's scopes satisfy a required scope (`full` satisfies all).
export function scopeSatisfies(keyScopes: Scope[], required: Scope): boolean {
  if (keyScopes.includes('full')) return true
  return keyScopes.includes(required)
}

// A safe (no hash/salt) view of a key for the renderer UI + list endpoints.
export interface ApiKeyPublic {
  id: string
  name: string
  mask: string
  scopes: Scope[]
  createdAt: string
  lastUsedAt: string | null
}

export function toPublicKey(k: ApiKeyRecord): ApiKeyPublic {
  return {
    id: k.id,
    name: k.name,
    mask: k.mask,
    scopes: k.scopes,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt
  }
}

// Structured error body returned by every REST route.
export interface ApiErrorBody {
  error: { code: string; message: string }
}
