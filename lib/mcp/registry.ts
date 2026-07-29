// The TOOLS registry — single source of truth consumed by both the MCP endpoint
// (to register tools + drive the generic executor) and the Electron agent (to
// know which tools it must implement and their arg shapes).
//
// COPY-SYNCABLE: no Next.js / server / Node imports. zod v4 only.

import type { z } from 'zod'
import * as S from './schemas'

// ── Tool metadata ───────────────────────────────────────────────────
// annotations mirror the MCP spec's tool hints. `mode` decides whether the
// executor awaits a result (sync) or returns { command_id, running } (async).
export interface ToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  // openWorldHint is always effectively true (talks to a device) — omitted.
}

export interface ToolDef {
  name: string
  title: string
  description: string
  inputSchema: z.ZodTypeAny
  outputSchema: z.ZodTypeAny
  annotations: ToolAnnotations
  // Sync: relay awaits res:{commandId} up to timeoutMs. Async: relay returns
  // { command_id, status:"running" } immediately for get_command_status polling.
  mode: 'sync' | 'async'
  // Max time the relay waits for a device result before returning TIMEOUT
  // (sync) or before the command is considered stale (async claim TTL).
  timeoutMs: number
  // read-only tools bypass the write-enabled toggle and the destructive gate.
  readOnly: boolean
  // destructive tools require confirm:true before the command is enqueued.
  destructive: boolean
}

// Descriptions are written FOR AN LLM: when to use, what it returns, what it
// won't do. Each is kept under ~80 words.
export const TOOLS: readonly ToolDef[] = [
  // ── read-only ──────────────────────────────────────────────────
  {
    name: 'list_devices',
    title: 'List devices',
    description:
      'List the TubeGhost desktop devices linked to this account and whether each is online right now. ' +
      'Call this FIRST whenever an action fails with NO_DEVICE or AMBIGUOUS_DEVICE, or when the user has more ' +
      'than one machine. Returns id, name, platform, app version, online status, and whether write actions are ' +
      'allowed. Does NOT launch or modify anything.',
    inputSchema: S.listDevicesInput,
    outputSchema: S.listDevicesOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
    mode: 'sync',
    timeoutMs: 8000,
    readOnly: true,
    destructive: false,
  },
  {
    name: 'get_device_status',
    title: 'Get device status',
    description:
      'Get live status for one device: online/offline, last seen, app version, and how many browser sessions ' +
      'are currently open. Use to check a device is reachable before launching profiles. If device_id is omitted ' +
      'and exactly one device is online it is chosen automatically. Read-only.',
    inputSchema: S.getDeviceStatusInput,
    outputSchema: S.getDeviceStatusOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
    mode: 'sync',
    timeoutMs: 8000,
    readOnly: true,
    destructive: false,
  },
  {
    name: 'list_profiles',
    title: 'List profiles',
    description:
      'List browser profiles on the target device, optionally filtered by a name/tag query. Returns a summary per ' +
      'profile (id, name, platform, group, proxy label, tags, open/closed status). Use before launching, updating, ' +
      'or deleting a profile to find its id. Never returns proxy credentials, cookies, or fingerprint secrets.',
    inputSchema: S.listProfilesInput,
    outputSchema: S.listProfilesOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
    mode: 'sync',
    timeoutMs: 10000,
    readOnly: true,
    destructive: false,
  },
  {
    name: 'get_profile',
    title: 'Get profile',
    description:
      'Get the summary for a single profile by id: name, platform, group, proxy label, tags, and whether a session ' +
      'is open. Use after list_profiles to confirm details before an action. Does NOT expose credentials, cookies, ' +
      'or fingerprint configuration.',
    inputSchema: S.getProfileInput,
    outputSchema: S.getProfileOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
    mode: 'sync',
    timeoutMs: 8000,
    readOnly: true,
    destructive: false,
  },
  {
    name: 'list_proxies',
    title: 'List proxies',
    description:
      'List proxies available on the target device, with a human label, type, location, source, and how many ' +
      'profiles use each. Use to pick a proxy_id for create_profile or assign_proxy. Never returns the proxy IP, ' +
      'host, port, username, or password.',
    inputSchema: S.listProxiesInput,
    outputSchema: S.listProxiesOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
    mode: 'sync',
    timeoutMs: 10000,
    readOnly: true,
    destructive: false,
  },
  {
    name: 'get_plan_usage',
    title: 'Get plan usage',
    description:
      'Report the account plan and current usage: profiles used vs limit and members used vs limit (null limit = ' +
      'unlimited). Use to check whether creating more profiles is allowed before calling create_profile or ' +
      'bulk_import_profiles. Read-only; cannot change the plan.',
    inputSchema: S.getPlanUsageInput,
    outputSchema: S.getPlanUsageOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
    mode: 'sync',
    timeoutMs: 8000,
    readOnly: true,
    destructive: false,
  },
  {
    name: 'get_command_status',
    title: 'Get command status',
    description:
      'Poll the status of an async command (from launch_profile or bulk_import_profiles) by command_id. Returns ' +
      'queued/running/succeeded/failed and, when finished, the result or a structured error. Call repeatedly until ' +
      'status is succeeded or failed. Read-only.',
    inputSchema: S.getCommandStatusInput,
    outputSchema: S.getCommandStatusOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
    mode: 'sync',
    timeoutMs: 8000,
    readOnly: true,
    destructive: false,
  },
  // ── write ──────────────────────────────────────────────────────
  {
    name: 'create_profile',
    title: 'Create profile',
    description:
      'Create one browser profile on the target device with a name and optional platform, group, proxy, tags, and ' +
      'notes. Fingerprint details are generated by TubeGhost — you do NOT set them. Returns the new profile summary. ' +
      'Check get_plan_usage first if the account may be at its profile limit.',
    inputSchema: S.createProfileInput,
    outputSchema: S.createProfileOutput,
    annotations: { idempotentHint: false },
    mode: 'sync',
    timeoutMs: 15000,
    readOnly: false,
    destructive: false,
  },
  {
    name: 'update_profile',
    title: 'Update profile',
    description:
      'Update editable metadata on an existing profile: name, group, tags, and notes. Only the fields you provide ' +
      'change. Cannot edit fingerprint, proxy credentials, or launch args (use assign_proxy for proxies). Returns ' +
      'the updated summary.',
    inputSchema: S.updateProfileInput,
    outputSchema: S.updateProfileOutput,
    annotations: { idempotentHint: true },
    mode: 'sync',
    timeoutMs: 12000,
    readOnly: false,
    destructive: false,
  },
  {
    name: 'clone_profile',
    title: 'Clone profile',
    description:
      'Duplicate an existing profile one or more times (count up to 50). Each clone gets a fresh fingerprint and its ' +
      'own name. Use to scale out a working setup. Returns the created profile summaries. Check get_plan_usage if the ' +
      'account may be near its profile limit.',
    inputSchema: S.cloneProfileInput,
    outputSchema: S.cloneProfileOutput,
    annotations: { idempotentHint: false },
    mode: 'sync',
    timeoutMs: 20000,
    readOnly: false,
    destructive: false,
  },
  {
    name: 'assign_proxy',
    title: 'Assign proxy',
    description:
      'Attach a proxy (by proxy_id from list_proxies) to a profile, replacing any current proxy. Use to move a ' +
      'profile onto a specific proxy. Returns the updated profile summary. Does not test the proxy connection.',
    inputSchema: S.assignProxyInput,
    outputSchema: S.assignProxyOutput,
    annotations: { idempotentHint: true },
    mode: 'sync',
    timeoutMs: 12000,
    readOnly: false,
    destructive: false,
  },
  {
    name: 'bulk_import_profiles',
    title: 'Bulk import profiles',
    description:
      'Create many profiles at once from a list of rows (name + optional platform/group/proxy/tags), up to 500. ' +
      'Runs asynchronously: returns a command_id immediately; poll get_command_status for progress and the final ' +
      'count. Check get_plan_usage first — the import stops at the plan limit.',
    inputSchema: S.bulkImportProfilesInput,
    outputSchema: S.bulkImportProfilesOutput,
    annotations: { idempotentHint: false },
    mode: 'async',
    timeoutMs: 300000,
    readOnly: false,
    destructive: false,
  },
  // ── destructive ────────────────────────────────────────────────
  {
    name: 'delete_profile',
    title: 'Delete profile',
    description:
      'Permanently delete a profile and its local browser data. IRREVERSIBLE. Without confirm:true this returns a ' +
      'dry-run describing exactly what would be deleted (including closing any open session) and does nothing — ' +
      're-invoke with confirm:true to actually delete. Always show the user the dry-run before confirming.',
    inputSchema: S.deleteProfileInput,
    outputSchema: S.deleteProfileOutput,
    annotations: { destructiveHint: true, idempotentHint: false },
    mode: 'sync',
    timeoutMs: 15000,
    readOnly: false,
    destructive: true,
  },
  // ── actions ────────────────────────────────────────────────────
  {
    name: 'launch_profile',
    title: 'Launch profile',
    description:
      'Open the browser for a profile on the target device, optionally navigating to a URL. Runs asynchronously ' +
      '(the browser takes time to start): returns a command_id immediately; poll get_command_status until it ' +
      'succeeds. Use stop_profile to close it later. Does NOT run scripts or automate the page.',
    inputSchema: S.launchProfileInput,
    outputSchema: S.launchProfileOutput,
    annotations: { idempotentHint: false },
    mode: 'async',
    timeoutMs: 60000,
    readOnly: false,
    destructive: false,
  },
  {
    name: 'stop_profile',
    title: 'Stop profile',
    description:
      'Close the running browser session for a profile on the target device. Safe to call if it is already closed ' +
      '(returns stopped:false). Use after launch_profile to shut a session down. Does not delete the profile.',
    inputSchema: S.stopProfileInput,
    outputSchema: S.stopProfileOutput,
    annotations: { idempotentHint: true },
    mode: 'sync',
    timeoutMs: 15000,
    readOnly: false,
    destructive: false,
  },
  {
    name: 'open_url_in_profile',
    title: 'Open URL in profile',
    description:
      'Open a URL in a new tab of a profile that is already running. The profile must have an open session ' +
      '(launch_profile first). Returns whether the tab was opened. Does NOT execute JavaScript, fill forms, or ' +
      'automate the page beyond navigating to the URL.',
    inputSchema: S.openUrlInProfileInput,
    outputSchema: S.openUrlInProfileOutput,
    annotations: { idempotentHint: false },
    mode: 'sync',
    timeoutMs: 15000,
    readOnly: false,
    destructive: false,
  },
] as const

export type ToolName = (typeof TOOLS)[number]['name']

const BY_NAME: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

export function getTool(name: string): ToolDef | undefined {
  return BY_NAME[name]
}
