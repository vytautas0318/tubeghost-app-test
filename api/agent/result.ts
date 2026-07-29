// POST /api/agent/result — the desktop app returns a command's outcome.
//
// CALLED BY: the Electron main process after executing a command it received
//            from /poll. Authorization: Bearer <device token>.
//
// Writes res:{commandId} (TTL 120s) which the relay's sync tools are awaiting,
// and best-effort updates the command_log row's status. The device may only
// post results for commands claimed under ITS token — enforced by the claim
// key being scoped per command and the device auth here (a device can't guess
// another user's opaque command_id).
//
// Request:  { commandId, status: "succeeded"|"failed", result?, error? }
// Response: { ok: true } | { error }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../_lib/env.js'
import { updateCommandLog } from '../_lib/db.js'
import { putResult } from '../_lib/bus.js'
import { authOrReject, parseBody } from '../_lib/agent-http.js'

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

  const body = parseBody(req)
  const commandId = String(body.commandId ?? '').trim()
  const status = body.status === 'failed' ? 'failed' : body.status === 'succeeded' ? 'succeeded' : null
  if (!commandId || !status) {
    res.status(400).json({ error: 'invalid_result' })
    return
  }

  // The error, if any, is a ToolError object from the contract. We do not
  // inspect it here — the relay forwards it to Claude verbatim.
  const errorCode =
    status === 'failed' && body.error && typeof body.error === 'object'
      ? String((body.error as { code?: unknown }).code ?? 'DEVICE_ERROR')
      : null

  await putResult({
    command_id: commandId,
    status,
    ...(status === 'succeeded' ? { result: body.result } : {}),
    ...(status === 'failed' ? { error: body.error } : {}),
  })

  await updateCommandLog(commandId, { status, error_code: errorCode })

  res.status(200).json({ ok: true })
}
