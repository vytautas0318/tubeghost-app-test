// POST /api/mcp — the MCP endpoint (stateless JSON-RPC over HTTP).
//
// Transport: rather than StreamableHTTPServerTransport (which streams SSE by
// bridging Node req/res → Web Request/Response and crashes on @vercel/node), we
// dispatch each JSON-RPC message against a fresh McpServer via the SDK's
// InMemoryTransport and return the reply as plain JSON. This is fully stateless
// (a new server per request; tools/list + tools/call work without a prior
// initialize handshake) and needs no HTTP streaming.
//
// Auth: OAuth 2.1 Bearer (JWT, aud = MCP_RESOURCE). Unauthenticated → 401 +
// WWW-Authenticate so Claude starts the OAuth flow. Origin is validated.
// GET/DELETE: 405 (no sessions to stream/tear down).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../_lib/env.js'
import { jwtConfigured } from '../_lib/jwt.js'
import { authenticateMcp, originAllowed, unauthorized } from '../_lib/mcp-auth.js'
// buildServer + dispatchOne (which pull in the MCP SDK + lib/mcp contract) are
// imported LAZILY inside the handler so a bundling/resolution failure surfaces
// as a catchable JSON error instead of an uncatchable module-load crash.

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (!relayConfigured() || !jwtConfigured()) {
    res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'server not configured' }, id: null })
    return
  }
  if (!originAllowed(req)) {
    res.status(403).json({ jsonrpc: '2.0', error: { code: -32001, message: 'origin not allowed' }, id: null })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST.' }, id: null })
    return
  }

  const claims = authenticateMcp(req)
  if (!claims) {
    unauthorized(res)
    return
  }

  // @vercel/node pre-parses the JSON body. Accept a single request or a batch.
  const body = req.body as unknown
  const isBatch = Array.isArray(body)
  const messages = (isBatch ? body : [body]) as { jsonrpc: '2.0'; id?: string | number | null; method?: string }[]

  try {
    const { buildServer } = await import('../_lib/mcp-server.js')
    const { dispatchOne } = await import('../_lib/mcp-dispatch.js')
    const results = []
    for (const message of messages) {
      // Fresh server per message so a tool always closes over THIS user only.
      const server = buildServer(claims.sub)
      const reply = await dispatchOne(server, message)
      if (reply) results.push(reply)
    }

    // Notifications produce no reply → 202 with no body (per JSON-RPC).
    if (results.length === 0) {
      res.status(202).end()
      return
    }
    res.status(200).json(isBatch ? results : results[0])
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'internal error' }, id: null })
    }
  }
}
