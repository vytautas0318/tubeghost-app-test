// The ONE generic tool executor. Every MCP tool call flows through here:
//
//   resolve device (from device_id or auto-resolve the single online device)
//   → enforce write/destructive gates → validate args (already zod-parsed by the
//   SDK) → write CommandLog → enqueue the command → for SYNC tools await the
//   device's result (poll res:{commandId}); for ASYNC tools return
//   { command_id, status:"running" } immediately.
//
// The relay reimplements NO TubeGhost logic — it forwards the command and
// returns whatever the device sends back. Failures become structured ToolErrors,
// never thrown, so Claude always gets an actionable result.

import { getTool, err, type ToolError } from '../../lib/mcp/contract.js'
import { getDeviceById, insertCommandLog, listDevices, updateCommandLog, type DeviceRow } from './db.js'
import { enqueueCommand, enqueueLimiter, getResult, onlineSet, type CommandResult } from './bus.js'
import { redactArgs } from './redact.js'
import { randomId } from './oauth-store.js'
import { errorOutcome, type ExecOutcome } from './executor-types.js'
import { execCommandStatus, execListDevices } from './executor-local.js'

export type { ExecOutcome }

const RESULT_POLL_MS = 250
const MAX_SYNC_WAIT_MS = 45_000

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Resolve the target device for a command. Read-only tools that omit device_id
 *  still need one (they run on a device); the same 0/1/many rule applies. */
async function resolveDevice(
  userId: string,
  deviceId: string | undefined,
): Promise<{ device: DeviceRow } | { error: ToolError }> {
  if (deviceId) {
    const device = await getDeviceById(userId, deviceId)
    if (!device || device.revoked_at) {
      return { error: err('DEVICE_NOT_FOUND', 'That device does not exist or was removed.', 'Call list_devices.') }
    }
    return { device }
  }
  // Auto-resolve: exactly one ONLINE device → use it. 0 or 2+ → structured error.
  const devices = (await listDevices(userId)).filter((d) => !d.revoked_at)
  const online = await onlineSet(devices.map((d) => d.id))
  const onlineDevices = devices.filter((d) => online.has(d.id))
  if (onlineDevices.length === 1) return { device: onlineDevices[0] }
  if (onlineDevices.length === 0) {
    return {
      error: err(
        'NO_DEVICE',
        devices.length === 0
          ? 'No TubeGhost device is paired with this account.'
          : 'No paired device is online right now.',
        'Ask the user to open TubeGhost and enable Claude Bridge, then call list_devices.',
      ),
    }
  }
  return {
    error: err(
      'AMBIGUOUS_DEVICE',
      `${onlineDevices.length} devices are online. Specify which one.`,
      'Call list_devices and pass device_id.',
      { online_devices: onlineDevices.map((d) => ({ id: d.id, name: d.name })) },
    ),
  }
}

/** Wait for the device to post res:{commandId}, up to the tool timeout (capped
 *  at MAX_SYNC_WAIT_MS). Returns null on timeout — the caller reports "running". */
async function awaitResult(commandId: string, timeoutMs: number): Promise<CommandResult | null> {
  const deadline = Date.now() + Math.min(timeoutMs, MAX_SYNC_WAIT_MS)
  for (;;) {
    const r = await getResult(commandId)
    if (r) return r
    if (Date.now() >= deadline) return null
    await sleep(RESULT_POLL_MS)
  }
}

export async function executeTool(
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ExecOutcome> {
  const tool = getTool(toolName)
  if (!tool) return errorOutcome(err('NOT_FOUND', `Unknown tool ${toolName}.`))

  // ── Relay-local tools: answered from the relay's own state, no device
  //    round-trip (the relay owns the device registry + command results). ──
  if (toolName === 'list_devices') return await execListDevices(userId)
  if (toolName === 'get_command_status') return await execCommandStatus(userId, args)

  // Per-user enqueue rate limit (≤60/min). Read-only status polls also count —
  // that's fine, 60/min is generous for interactive use.
  const rl = await enqueueLimiter().limit(userId)
  if (!rl.success) {
    return errorOutcome(err('RATE_LIMITED', 'Too many commands in a short window. Wait a moment and retry.'))
  }

  const deviceId = typeof args.device_id === 'string' ? args.device_id : undefined
  const resolved = await resolveDevice(userId, deviceId)
  if ('error' in resolved) return errorOutcome(resolved.error)
  const device = resolved.device

  // Write gate: non-read-only tools require the per-device toggle.
  if (!tool.readOnly && !device.write_enabled) {
    return errorOutcome(
      err('WRITE_DISABLED', `Write actions from Claude are turned off for "${device.name}".`,
        'Ask the user to enable write actions for this device in Settings → Claude.'),
    )
  }

  // Destructive gate: require confirm:true. Without it, return a dry-run by
  // still sending the command (the device produces the plan) — but only when the
  // tool itself supports the dry-run path. delete_profile does: it inspects
  // `confirm` on the device side. We pass confirm through unchanged; if it's
  // false the device returns { deleted:false, would_delete:… }.
  // (No enqueue-time block needed — the device is the source of truth on what
  //  confirm:false does — but we DO refuse to enqueue a destructive command
  //  when write is disabled, handled above.)

  const commandId = randomId(18)
  const deadline = Date.now() + tool.timeoutMs

  // Audit BEFORE enqueue so a crash still leaves a trace. args are redacted.
  await insertCommandLog({
    id: commandId,
    user_id: userId,
    device_id: device.id,
    tool: toolName,
    args_redacted: redactArgs(args),
    status: 'queued',
    source: 'mcp',
  }).catch(() => {
    /* audit best-effort */
  })

  await enqueueCommand(device.id, { command_id: commandId, tool: toolName, args, deadline })

  // ── async tools: return immediately ───────────────────────────────
  if (tool.mode === 'async') {
    await updateCommandLog(commandId, { status: 'running' })
    return {
      structuredContent: { command_id: commandId, status: 'running' },
      text: `Started ${toolName} on "${device.name}". Poll get_command_status with command_id "${commandId}".`,
      isError: false,
    }
  }

  // ── sync tools: await the device result ───────────────────────────
  const started = Date.now()
  const result = await awaitResult(commandId, tool.timeoutMs)
  if (!result) {
    // Timed out waiting. NEVER throw — hand back a running handle to poll.
    await updateCommandLog(commandId, { status: 'running', duration_ms: Date.now() - started })
    return {
      structuredContent: { command_id: commandId, status: 'running' },
      text: `${toolName} is taking longer than expected on "${device.name}". Poll get_command_status with command_id "${commandId}".`,
      isError: false,
    }
  }

  await updateCommandLog(commandId, {
    status: result.status,
    duration_ms: Date.now() - started,
    error_code: result.status === 'failed' ? String((result.error as { code?: unknown })?.code ?? 'DEVICE_ERROR') : null,
  })

  if (result.status === 'failed') {
    const e = (result.error as ToolError) ?? err('DEVICE_ERROR', 'The device reported a failure.')
    return errorOutcome(e)
  }

  const structured = (result.result as Record<string, unknown>) ?? {}
  return { structuredContent: structured, text: summarize(toolName, device.name, structured), isError: false }
}

/** A short, human-readable one-liner for the text content block. */
function summarize(toolName: string, deviceName: string, data: Record<string, unknown>): string {
  switch (toolName) {
    case 'list_devices':
      return `${(data.devices as unknown[])?.length ?? 0} device(s).`
    case 'list_profiles':
      return `${(data.profiles as unknown[])?.length ?? 0} profile(s) on "${deviceName}" (total ${data.total ?? '?'}).`
    case 'list_proxies':
      return `${(data.proxies as unknown[])?.length ?? 0} proxy(ies) on "${deviceName}".`
    case 'delete_profile':
      return data.deleted
        ? `Deleted profile "${data.profile_name}".`
        : `Dry run: deleting "${data.profile_name}" is irreversible. Re-invoke with confirm:true to proceed.`
    default:
      return `Done on "${deviceName}".`
  }
}
