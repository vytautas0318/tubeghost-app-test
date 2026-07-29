// GET /.well-known/oauth-protected-resource            (via rewrite → here)
// GET /.well-known/oauth-protected-resource/api/mcp    (via rewrite → here)
//
// RFC 9728 protected-resource metadata. The MCP endpoint's 401 points Claude
// here (WWW-Authenticate: resource_metadata=...), and this tells it which
// authorization server to use. `resource` MUST equal the token audience exactly.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ISSUER, MCP_RESOURCE, relayConfigured } from '../_lib/env.js'

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')
  if (!relayConfigured()) {
    res.status(500).json({ error: 'server_error' })
    return
  }

  res.status(200).json({
    resource: MCP_RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
  })
}
