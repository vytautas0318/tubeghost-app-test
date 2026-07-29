// Relay-local tool implementations: tools answered from the relay's own state
// with NO device round-trip (the relay owns the device registry + command
// results). Split out of executor.ts to keep each file focused.

import { err } from '../../lib/mcp/contract.js'
import { getCommandLogById, listDevices } from './db.js'
import { getResult, onlineSet } from './bus.js'
import { errorOutcome, type ExecOutcome } from './executor-types.js'

/** list_devices — the relay owns the device registry; presence from Redis. */
export async function execListDevices(userId: string): Promise<ExecOutcome> {
  const rows = (await listDevices(userId)).filter((d) => !d.revoked_at)
  const online = await onlineSet(rows.map((d) => d.id))
  const devices = rows.map((d) => ({
    id: d.id,
    name: d.name,
    platform: d.platform ?? 'unknown',
    app_version: d.app_version ?? 'unknown',
    online: online.has(d.id),
    last_seen_at: d.last_seen_at,
    write_enabled: d.write_enabled,
  }))
  return {
    structuredContent: { devices },
    text: `${devices.length} device(s); ${devices.filter((d) => d.online).length} online.`,
    isError: false,
  }
}

/** get_command_status — read the fresh result from Redis, else the log row. */
export async function execCommandStatus(userId: string, args: Record<string, unknown>): Promise<ExecOutcome> {
  const commandId = String(args.command_id ?? '')
  // Ownership: the log row is user-scoped, so a command_id from another user
  // returns NOT_FOUND even though the Redis result key is global.
  const logRow = await getCommandLogById(userId, commandId)
  if (!logRow) return errorOutcome(err('NOT_FOUND', 'No such command for this account.'))

  const r = await getResult(commandId)
  const status = r ? r.status : logRow.status
  const out: Record<string, unknown> = { command_id: commandId, tool: logRow.tool, status }
  if (r?.status === 'succeeded') out.result = r.result
  if (r?.status === 'failed') out.error = r.error
  return { structuredContent: out, text: `Command ${commandId}: ${status}.`, isError: false }
}
