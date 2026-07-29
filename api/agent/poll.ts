// POST /api/agent/poll — the desktop app long-polls for queued commands.
//
// CALLED BY: the Electron main process in a loop. Authorization: Bearer <device
//            token>. Holds the request open up to waitMs (≤25s), returning as
//            soon as any command is available.
//
// Behavior (from the Phase-2 brief):
//   - refresh presence + last_seen_at (this is what marks the device "online")
//   - RPOP q:{deviceId}; if a command is found, claim it (claim:{commandId},
//     TTL = the command's remaining deadline) and return immediately
//   - if empty, sleep 300ms and retry until waitMs elapses, then return
//     { commands: [] } with 200. NEVER hold past 25s (serverless ceiling).
//   - drain the queue in one shot: return every command currently waiting.
//
// Rate limit: ≤10 polls/sec per device.
//
// Request:  { waitMs?<=25000 }   (deviceId is implied by the token)
// Response: { commands: [{ command_id, tool, args, deadline }] } | { error }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../_lib/env.js'
import { patchDevice } from '../_lib/db.js'
import {
  claimCommand,
  dequeueCommand,
  pollLimiter,
  touchPresence,
  type QueuedCommand,
} from '../_lib/bus.js'
import { authOrReject, parseBody } from '../_lib/agent-http.js'

export const config = { maxDuration: 60 }

const MAX_WAIT_MS = 25_000
const TICK_MS = 300

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Pop everything currently queued (a burst of commands shouldn't need N polls).
 *  Claims each with its remaining time-to-deadline as the claim TTL. */
async function drain(deviceId: string): Promise<QueuedCommand[]> {
  const out: QueuedCommand[] = []
  for (;;) {
    const cmd = await dequeueCommand(deviceId)
    if (!cmd) break
    const remaining = Math.max(1000, cmd.deadline - Date.now())
    await claimCommand(cmd.command_id, remaining)
    out.push(cmd)
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!relayConfigured()) {
    res.status(500).json({ error: 'server_error' })
    return
  }

  const device = await authOrReject(req, res)
  if (!device) return

  const { success } = await pollLimiter().limit(device.id)
  if (!success) {
    res.status(429).json({ error: 'rate_limited' })
    return
  }

  // Presence + durable mirror. This is the ONLY thing that makes the device
  // read "online", so do it up front (before any long wait).
  await touchPresence(device.id)
  await patchDevice(device.id, { last_seen_at: new Date().toISOString() }).catch(() => {})

  const rawWait = Number(parseBody(req).waitMs)
  const waitMs = Number.isFinite(rawWait) ? Math.min(Math.max(rawWait, 0), MAX_WAIT_MS) : MAX_WAIT_MS
  const deadline = Date.now() + waitMs

  // Fast path + long-poll loop.
  for (;;) {
    const commands = await drain(device.id)
    if (commands.length > 0) {
      res.status(200).json({ commands })
      return
    }
    if (Date.now() >= deadline) {
      res.status(200).json({ commands: [] })
      return
    }
    // Refresh presence periodically during a long hold so a device that polls
    // with a long waitMs doesn't lapse to "offline" mid-wait.
    await touchPresence(device.id)
    await sleep(Math.min(TICK_MS, Math.max(0, deadline - Date.now())))
  }
}
