// GET /.well-known/oauth-authorization-server (via rewrite → here)
//
// RFC 8414 authorization-server metadata. Claude fetches this to discover the
// authorize / token / registration endpoints and the supported PKCE method.
// Every URL is derived from PUBLIC_BASE_URL — never hardcoded.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ISSUER, PUBLIC_BASE_URL, relayConfigured } from '../../env.js'

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')
  if (!relayConfigured()) {
    res.status(500).json({ error: 'server_error' })
    return
  }

  res.status(200).json({
    issuer: ISSUER,
    authorization_endpoint: `${PUBLIC_BASE_URL}/api/oauth/authorize`,
    token_endpoint: `${PUBLIC_BASE_URL}/api/oauth/token`,
    registration_endpoint: `${PUBLIC_BASE_URL}/api/oauth/register`,
    revocation_endpoint: `${PUBLIC_BASE_URL}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // PKCE S256 REQUIRED — no 'plain'.
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  })
}
