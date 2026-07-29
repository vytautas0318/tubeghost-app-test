// Resource-server auth for the MCP endpoint (used in Phase 4).
//
// On an unauthenticated/invalid MCP request we MUST return 401 with a
// WWW-Authenticate header pointing at the protected-resource metadata — Claude
// reads this to start the OAuth flow. Also validates the Origin header (DNS
// rebinding protection per the MCP transport spec).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PUBLIC_BASE_URL } from './env.js'
import { verifyAccessToken, type AccessClaims } from './jwt.js'
import { bearerFromHeader } from './session.js'

const RESOURCE_METADATA_URL = `${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`

/** Send the spec-required 401 that bootstraps Claude's OAuth flow. */
export function unauthorized(res: VercelResponse, desc?: string): void {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${RESOURCE_METADATA_URL}"${desc ? `, error="invalid_token", error_description="${desc}"` : ''}`,
  )
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: desc ?? 'Unauthorized' },
    id: null,
  })
}

/** True if the request Origin is one we accept. Claude's infra + our own host.
 *  A missing Origin (non-browser server-to-server) is allowed. */
export function originAllowed(req: VercelRequest): boolean {
  const origin = req.headers.origin
  const o = Array.isArray(origin) ? origin[0] : origin
  if (!o) return true // no Origin → not a browser cross-origin request
  try {
    const host = new URL(o).host
    if (host === new URL(PUBLIC_BASE_URL).host) return true
    // Anthropic connector origins.
    return /(^|\.)claude\.ai$|(^|\.)anthropic\.com$/.test(host)
  } catch {
    return false
  }
}

/** Authenticate an MCP request. Returns claims or null (after 401 not sent —
 *  caller decides). */
export function authenticateMcp(req: VercelRequest): AccessClaims | null {
  const token = bearerFromHeader(req.headers.authorization)
  if (!token) return null
  return verifyAccessToken(token)
}
