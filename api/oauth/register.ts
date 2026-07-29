// POST /api/oauth/register — RFC 7591 Dynamic Client Registration.
//
// CALLED BY: Claude's connector, unauthenticated (open registration is the DCR
//            model MCP relies on). We register a PUBLIC client (PKCE, no secret)
//            and validate redirect_uris. No client_secret is ever issued.
//
// Request:  { client_name?, redirect_uris: [...], token_endpoint_auth_method? }
// Response: 201 { client_id, redirect_uris, token_endpoint_auth_method, ... }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../_lib/env.js'
import { putClient, randomId, type OAuthClient } from '../_lib/oauth-store.js'

function parseBody(req: VercelRequest): Record<string, unknown> {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  } catch {
    return {}
  }
}

/** Only https redirect URIs (or http://localhost / http://127.0.0.1 for local
 *  connector testing). Rejects everything else. */
function validRedirect(uri: unknown): uri is string {
  if (typeof uri !== 'string') return false
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return false
  }
  if (u.protocol === 'https:') return true
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true
  return false
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

  const body = parseBody(req)
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []
  if (uris.length === 0 || !uris.every(validRedirect)) {
    res.status(400).json({ error: 'invalid_redirect_uri' })
    return
  }
  // Only public (PKCE) clients — we never issue secrets.
  const method = body.token_endpoint_auth_method
  if (method != null && method !== 'none') {
    res.status(400).json({ error: 'invalid_client_metadata', error_description: 'only token_endpoint_auth_method=none is supported' })
    return
  }

  const client: OAuthClient = {
    client_id: `mcp_${randomId(16)}`,
    client_name: typeof body.client_name === 'string' ? body.client_name.slice(0, 200) : undefined,
    redirect_uris: uris as string[],
    token_endpoint_auth_method: 'none',
    created_at: Date.now(),
  }
  await putClient(client)

  res.status(201).json({
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  })
}
