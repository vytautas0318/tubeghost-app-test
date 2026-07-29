// POST /api/mcp — the Streamable HTTP MCP endpoint (stateless).
//
// Stateless per the Phase-4 brief: a FRESH McpServer + transport per request,
// sessionIdGenerator undefined, connect → handleRequest(req, res, req.body) →
// close both on response end. Serverless has no cross-invocation memory, so no
// session state is held in module scope.
//
// Auth: OAuth 2.1 Bearer (JWT, aud = MCP_RESOURCE). An unauthenticated/invalid
// request gets the spec-required 401 + WWW-Authenticate so Claude starts the
// OAuth flow. Origin is validated (DNS-rebinding protection).
//
// GET + DELETE: 405 with a JSON-RPC error body (allowed in stateless mode).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { relayConfigured } from '../_lib/env.js'
import { jwtConfigured } from '../_lib/jwt.js'
import { authenticateMcp, originAllowed, unauthorized } from '../_lib/mcp-auth.js'
import { buildServer } from '../_lib/mcp-server.js'

export const config = { maxDuration: 60 }

function methodNotAllowed(res: VercelResponse): void {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST for Streamable HTTP.' },
    id: null,
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (!relayConfigured() || !jwtConfigured()) {
    res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'server not configured' }, id: null })
    return
  }

  // DNS-rebinding protection: reject unexpected browser origins.
  if (!originAllowed(req)) {
    res.status(403).json({ jsonrpc: '2.0', error: { code: -32001, message: 'origin not allowed' }, id: null })
    return
  }

  // Streamable HTTP is POST-only in stateless mode. GET (SSE stream) and DELETE
  // (session teardown) have no meaning without sessions → 405.
  if (req.method !== 'POST') {
    methodNotAllowed(res)
    return
  }

  // OAuth Bearer. On failure, the 401 + WWW-Authenticate bootstraps the flow.
  const claims = authenticateMcp(req)
  if (!claims) {
    unauthorized(res)
    return
  }

  // Fresh server + transport per request (stateless). Tools close over the
  // authenticated userId so a tool can NEVER act for another user.
  const server: McpServer = buildServer(claims.sub)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  res.on('close', () => {
    void transport.close()
    void server.close()
  })

  try {
    await server.connect(transport)
    // @vercel/node pre-parses the body; pass it as the 3rd arg so the transport
    // does not try to re-read the (already-consumed) request stream.
    await transport.handleRequest(req, res, req.body)
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'internal error' }, id: null })
    }
  }
}
