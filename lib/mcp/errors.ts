// Structured error codes shared verbatim between the MCP relay and the Electron
// device agent. These are NOT thrown — they are returned as the `error` field of
// a tool result so Claude can act on them (e.g. "call list_devices first").
//
// COPY-SYNCABLE: no Next.js / server / Node imports. zod v4 only.

import { z } from 'zod'

// ── Machine-readable error codes ────────────────────────────────────
// Keep this list closed; both repos switch on it.
export const ERROR_CODES = [
  'NO_DEVICE', // user has zero online devices
  'AMBIGUOUS_DEVICE', // 2+ online devices, none specified
  'DEVICE_OFFLINE', // named device exists but is not connected
  'DEVICE_NOT_FOUND', // device_id does not belong to this user
  'CONFIRM_REQUIRED', // destructive tool called without confirm: true
  'WRITE_DISABLED', // per-device "allow write actions" toggle is off
  'INVALID_ARGS', // zod validation failed on the device side
  'TIMEOUT', // sync tool exceeded its timeout waiting for a result
  'DEVICE_ERROR', // the device executed and reported a failure
  'RATE_LIMITED', // caller exceeded an enqueue/poll budget
  'NOT_FOUND', // referenced entity (profile/proxy/command) does not exist
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

// ── Error object shape ──────────────────────────────────────────────
// `code` drives Claude's behavior; `message` is human-readable; `next` is an
// optional instruction (e.g. the tool to call next).
export const errorSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string(),
  // Optional actionable hint for the model, e.g. "call list_devices" or
  // "re-invoke with confirm: true".
  next: z.string().optional(),
  // Optional context bag (device name, last_seen, etc.) — never secrets.
  details: z.record(z.string(), z.unknown()).optional(),
})

export type ToolError = z.infer<typeof errorSchema>

// Convenience constructors used by the generic executor (server side only, but
// pure so they live in the shared contract too).
export function err(code: ErrorCode, message: string, next?: string, details?: Record<string, unknown>): ToolError {
  return { code, message, ...(next ? { next } : {}), ...(details ? { details } : {}) }
}
