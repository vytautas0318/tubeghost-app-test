// Upstash Redis command bus + presence + result store for the MCP relay.
//
// Uses @upstash/redis (HTTP REST — the only Redis client that works on Vercel
// serverless, no TCP sockets). All keys carry a TTL so a crashed device or a
// dropped result can never leak state.
//
// Key layout (from the Phase-2 brief):
//   q:{deviceId}        LIST  queued command JSON (LPUSH producer / RPOP consumer)
//   res:{commandId}     STRING result JSON, TTL 120s
//   claim:{commandId}   STRING set when a device picks it up, TTL = tool timeout
//   presence:{deviceId} STRING TTL 45s, refreshed by poll/heartbeat
//
// Rate limits (@upstash/ratelimit): per-device poll ≤ 10/s, per-user enqueue
// ≤ 60/min.

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL } from './env.js'

// A fresh client per module load is fine — it's stateless HTTP under the hood.
let _redis: Redis | null = null
export function redis(): Redis {
  if (!_redis) {
    _redis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN })
  }
  return _redis
}

// ── TTLs (seconds) ─────────────────────────────────────────────────
const RESULT_TTL = 120
const PRESENCE_TTL = 45
const QUEUE_TTL = 300 // safety net so an orphaned queue can't live forever

// ── Command envelope on the wire ───────────────────────────────────
export interface QueuedCommand {
  command_id: string
  tool: string
  args: Record<string, unknown>
  // Absolute epoch-ms deadline; the device should drop commands past it.
  deadline: number
}

export interface CommandResult {
  command_id: string
  status: 'succeeded' | 'failed'
  // Present on success — the tool's structuredContent.
  result?: unknown
  // Present on failure — a ToolError from the contract.
  error?: unknown
}

const qKey = (deviceId: string): string => `q:${deviceId}`
const resKey = (commandId: string): string => `res:${commandId}`
const claimKey = (commandId: string): string => `claim:${commandId}`
const presenceKey = (deviceId: string): string => `presence:${deviceId}`

// ── Enqueue / dequeue ──────────────────────────────────────────────
/** Producer: push a command onto the device's queue (LPUSH), refresh its TTL. */
export async function enqueueCommand(deviceId: string, cmd: QueuedCommand): Promise<void> {
  const key = qKey(deviceId)
  const r = redis()
  await r.lpush(key, JSON.stringify(cmd))
  await r.expire(key, QUEUE_TTL)
}

/** Consumer: pop one command (RPOP → FIFO with the LPUSH producer). Null when
 *  the queue is empty. */
export async function dequeueCommand(deviceId: string): Promise<QueuedCommand | null> {
  const raw = await redis().rpop<string>(qKey(deviceId))
  if (!raw) return null
  return typeof raw === 'string' ? (JSON.parse(raw) as QueuedCommand) : (raw as QueuedCommand)
}

/** Mark a command claimed by the device that popped it, TTL = the tool timeout
 *  (so a device that dies mid-command lets the claim lapse). */
export async function claimCommand(commandId: string, timeoutMs: number): Promise<void> {
  await redis().set(claimKey(commandId), '1', { ex: Math.ceil(timeoutMs / 1000) })
}

// ── Results ────────────────────────────────────────────────────────
export async function putResult(result: CommandResult): Promise<void> {
  await redis().set(resKey(result.command_id), JSON.stringify(result), { ex: RESULT_TTL })
}

export async function getResult(commandId: string): Promise<CommandResult | null> {
  const raw = await redis().get<string>(resKey(commandId))
  if (!raw) return null
  return typeof raw === 'string' ? (JSON.parse(raw) as CommandResult) : (raw as CommandResult)
}

// ── Presence ───────────────────────────────────────────────────────
/** Refresh a device's presence key (called on every poll + heartbeat). */
export async function touchPresence(deviceId: string): Promise<void> {
  await redis().set(presenceKey(deviceId), Date.now().toString(), { ex: PRESENCE_TTL })
}

export async function isOnline(deviceId: string): Promise<boolean> {
  return (await redis().exists(presenceKey(deviceId))) === 1
}

/** Batch presence check for the device list. Returns a Set of online ids. */
export async function onlineSet(deviceIds: string[]): Promise<Set<string>> {
  if (deviceIds.length === 0) return new Set()
  const keys = deviceIds.map(presenceKey)
  const vals = await redis().mget<(string | null)[]>(...keys)
  const online = new Set<string>()
  deviceIds.forEach((id, i) => {
    if (vals[i] != null) online.add(id)
  })
  return online
}

/** Drop a device's queue + presence on revoke, so a revoked device that is
 *  still mid-poll gets nothing and goes offline immediately. */
export async function dropDeviceState(deviceId: string): Promise<void> {
  await redis().del(qKey(deviceId), presenceKey(deviceId))
}

// ── Rate limiters ──────────────────────────────────────────────────
// Sliding windows. Analytics off (extra writes we don't need).
let _pollLimiter: Ratelimit | null = null
let _enqueueLimiter: Ratelimit | null = null

export function pollLimiter(): Ratelimit {
  if (!_pollLimiter) {
    _pollLimiter = new Ratelimit({
      redis: redis(),
      limiter: Ratelimit.slidingWindow(10, '1 s'),
      prefix: 'rl:poll',
    })
  }
  return _pollLimiter
}

export function enqueueLimiter(): Ratelimit {
  if (!_enqueueLimiter) {
    _enqueueLimiter = new Ratelimit({
      redis: redis(),
      limiter: Ratelimit.slidingWindow(60, '60 s'),
      prefix: 'rl:enqueue',
    })
  }
  return _enqueueLimiter
}
