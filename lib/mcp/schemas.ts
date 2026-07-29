// Zod input/output schemas for every v1 tool.
//
// Output schemas are RELAY-SHAPED, not DB rows: the desktop app owns the full
// profile/proxy shape and returns a curated subset. The relay never invents or
// reshapes data — it forwards what the device sends, validated against these.
//
// COPY-SYNCABLE: no Next.js / server / Node imports. zod v4 only.

import { z } from 'zod'
import { errorSchema } from './errors.js'

// ── Reusable primitives ─────────────────────────────────────────────
export const deviceIdSchema = z
  .string()
  .min(1)
  .describe('Target device id from list_devices. Omit if you have exactly one online device.')

export const commandIdSchema = z.string().min(1).describe('The command_id returned by an async tool.')

// device_id is optional on every non-read-only tool: the relay auto-resolves it
// when the user has exactly one online device.
const withOptionalDevice = { device_id: deviceIdSchema.optional() }

// A profile as summarized for an LLM. Deliberately small — no proxy secrets,
// cookies, fingerprint seeds, or launch args.
export const profileSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.string().describe('e.g. "Windows", "macOS"'),
  group: z.string().nullable().describe('Group/folder name, or null'),
  proxy_label: z.string().nullable().describe('Human proxy label, e.g. "US-Residential-3" — never credentials'),
  tags: z.array(z.string()),
  status: z.enum(['open', 'closed', 'unknown']).describe('Whether a browser session is currently open'),
  last_opened_at: z.string().nullable().describe('ISO 8601 timestamp or null'),
})

export const proxySummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string().describe('e.g. "http", "socks5", "residential"'),
  location: z.string().nullable().describe('Country/city if known — never the IP or credentials'),
  source: z.string().describe('e.g. "tubeproxies", "manual"'),
  assigned_count: z.number().int().describe('How many profiles currently use this proxy'),
})

export const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.string(),
  app_version: z.string(),
  online: z.boolean(),
  last_seen_at: z.string().nullable().describe('ISO 8601 timestamp or null'),
  write_enabled: z.boolean().describe('Whether write/action tools are permitted from Claude for this device'),
})

// Envelope every tool result flows through. Exactly one of ok/error meaningful.
export const commandRefSchema = z.object({
  command_id: commandIdSchema,
  status: z.enum(['running', 'succeeded', 'failed']),
})

// ── list_devices ────────────────────────────────────────────────────
export const listDevicesInput = z.object({})
export const listDevicesOutput = z.object({ devices: z.array(deviceSchema) })

// ── get_device_status ───────────────────────────────────────────────
export const getDeviceStatusInput = z.object({ device_id: deviceIdSchema.optional() })
export const getDeviceStatusOutput = z.object({
  device: deviceSchema,
  open_profiles: z.number().int().describe('Count of currently-open browser sessions on this device'),
})

// ── list_profiles ───────────────────────────────────────────────────
export const listProfilesInput = z.object({
  ...withOptionalDevice,
  query: z.string().optional().describe('Case-insensitive filter on profile name/tag'),
  limit: z.number().int().min(1).max(200).default(50).optional(),
})
export const listProfilesOutput = z.object({ profiles: z.array(profileSummarySchema), total: z.number().int() })

// ── get_profile ─────────────────────────────────────────────────────
export const getProfileInput = z.object({ ...withOptionalDevice, profile_id: z.string().min(1) })
export const getProfileOutput = z.object({ profile: profileSummarySchema })

// ── list_proxies ────────────────────────────────────────────────────
export const listProxiesInput = z.object({ ...withOptionalDevice })
export const listProxiesOutput = z.object({ proxies: z.array(proxySummarySchema) })

// ── get_plan_usage ──────────────────────────────────────────────────
export const getPlanUsageInput = z.object({ ...withOptionalDevice })
export const getPlanUsageOutput = z.object({
  plan: z.string(),
  profiles_used: z.number().int(),
  profiles_limit: z.number().int().nullable().describe('null = unlimited'),
  members_used: z.number().int(),
  members_limit: z.number().int().nullable(),
})

// ── get_command_status ──────────────────────────────────────────────
export const getCommandStatusInput = z.object({ command_id: commandIdSchema })
export const getCommandStatusOutput = z.object({
  command_id: z.string(),
  tool: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  // Present only when succeeded — the original tool's structuredContent.
  result: z.unknown().optional(),
  error: errorSchema.optional(),
})

// ── create_profile ──────────────────────────────────────────────────
export const createProfileInput = z.object({
  ...withOptionalDevice,
  name: z.string().min(1).max(120),
  platform: z.enum(['Windows', 'macOS', 'Linux']).optional().describe('Defaults to the workspace default if omitted'),
  group: z.string().optional().describe('Group/folder name; created if it does not exist'),
  proxy_id: z.string().optional().describe('Proxy to assign at creation, from list_proxies'),
  tags: z.array(z.string()).max(20).optional(),
  notes: z.string().max(2000).optional(),
})
export const createProfileOutput = z.object({ profile: profileSummarySchema })

// ── update_profile ──────────────────────────────────────────────────
export const updateProfileInput = z.object({
  ...withOptionalDevice,
  profile_id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  group: z.string().nullable().optional(),
  tags: z.array(z.string()).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
})
export const updateProfileOutput = z.object({ profile: profileSummarySchema })

// ── clone_profile ───────────────────────────────────────────────────
export const cloneProfileInput = z.object({
  ...withOptionalDevice,
  profile_id: z.string().min(1).describe('Source profile to clone'),
  name: z.string().min(1).max(120).optional().describe('Name for the clone; defaults to "<source> (copy)"'),
  count: z.number().int().min(1).max(50).default(1).optional().describe('How many clones to create'),
})
export const cloneProfileOutput = z.object({ profiles: z.array(profileSummarySchema) })

// ── assign_proxy ────────────────────────────────────────────────────
export const assignProxyInput = z.object({
  ...withOptionalDevice,
  profile_id: z.string().min(1),
  proxy_id: z.string().min(1).describe('Proxy from list_proxies to attach to the profile'),
})
export const assignProxyOutput = z.object({ profile: profileSummarySchema })

// ── bulk_import_profiles (async) ────────────────────────────────────
export const bulkImportProfilesInput = z.object({
  ...withOptionalDevice,
  // A compact row list rather than raw CSV, so the model builds it explicitly.
  rows: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        platform: z.enum(['Windows', 'macOS', 'Linux']).optional(),
        group: z.string().optional(),
        proxy_id: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(500),
})
export const bulkImportProfilesOutput = commandRefSchema

// ── delete_profile (destructive) ────────────────────────────────────
export const deleteProfileInput = z.object({
  ...withOptionalDevice,
  profile_id: z.string().min(1),
  confirm: z.boolean().default(false).describe('Must be true to actually delete. Without it, returns a dry-run plan.'),
})
// Union-ish: either a dry-run description or the deletion result. Kept as one
// object with an explicit `deleted` flag so the model reads it unambiguously.
export const deleteProfileOutput = z.object({
  deleted: z.boolean(),
  profile_id: z.string(),
  profile_name: z.string(),
  // Present on the dry-run (confirm:false) path.
  would_delete: z
    .object({ open_sessions_closed: z.number().int(), irreversible: z.literal(true) })
    .optional(),
})

// ── launch_profile (async action) ───────────────────────────────────
export const launchProfileInput = z.object({
  ...withOptionalDevice,
  profile_id: z.string().min(1),
  url: z.string().url().optional().describe('Optional URL to open on launch'),
})
export const launchProfileOutput = commandRefSchema

// ── stop_profile (action) ───────────────────────────────────────────
export const stopProfileInput = z.object({ ...withOptionalDevice, profile_id: z.string().min(1) })
export const stopProfileOutput = z.object({ profile_id: z.string(), stopped: z.boolean() })

// ── open_url_in_profile (action) ────────────────────────────────────
export const openUrlInProfileInput = z.object({
  ...withOptionalDevice,
  profile_id: z.string().min(1),
  url: z.string().url().describe('The URL to open. Opens a new tab in the running session.'),
})
export const openUrlInProfileOutput = z.object({ profile_id: z.string(), opened: z.boolean(), url: z.string() })
