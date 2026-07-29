// Shared request helpers for the three token-authed agent endpoints
// (poll / result / heartbeat). Keeps each endpoint file thin.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateAgent, type AgentAuthResult } from './device-token.js'
import { bearerFromHeader } from './session.js'
import type { DeviceRow } from './db.js'

export function parseBody(req: VercelRequest): Record<string, unknown> {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  } catch {
    return {}
  }
}

/** Authenticate the agent Bearer and reply 401 on failure. Returns the device
 *  on success, or null after having already sent the response. */
export async function authOrReject(req: VercelRequest, res: VercelResponse): Promise<DeviceRow | null> {
  const token = bearerFromHeader(req.headers.authorization)
  const auth: AgentAuthResult = await authenticateAgent(token)
  if (!auth.ok) {
    // A revoked device gets a distinct signal so the app can stop retrying and
    // prompt the user to re-pair.
    res.status(401).json(auth.reason === 'revoked' ? { error: 'revoked', revoked: true } : { error: 'unauthorized' })
    return null
  }
  return auth.device
}
