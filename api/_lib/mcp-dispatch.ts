// Stateless single-request MCP dispatch via the SDK's InMemoryTransport.
//
// Why not StreamableHTTPServerTransport? On Vercel @vercel/node, that transport
// bridges the Node req/res into a Web-standard Request/Response and streams SSE,
// which crashes the function (FUNCTION_INVOCATION_FAILED) — the Node↔Web stream
// conversion doesn't work in that runtime. For STATELESS request/response (one
// JSON-RPC in, one JSON-RPC out, no server-initiated notifications) we don't
// need HTTP streaming at all: connect the McpServer to an in-memory transport,
// feed the incoming message, capture the reply, return it as JSON.

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: string | number | null
  method?: string
  [k: string]: unknown
}

const NOTIFICATION_TIMEOUT_MS = 8000

/** Run one JSON-RPC request against a fresh server and return the matching
 *  response message (or null for a notification, which has no reply). */
export async function dispatchOne(server: McpServer, request: JsonRpcMessage): Promise<JsonRpcMessage | null> {
  const [client, srv] = InMemoryTransport.createLinkedPair()
  await server.connect(srv)

  const isNotification = request.id === undefined || request.id === null
  try {
    const responsePromise = new Promise<JsonRpcMessage | null>((resolve) => {
      if (isNotification) {
        // Notifications (e.g. notifications/initialized) get no response.
        resolve(null)
        return
      }
      const timer = setTimeout(() => resolve(null), NOTIFICATION_TIMEOUT_MS)
      client.onmessage = (m: unknown): void => {
        const msg = m as JsonRpcMessage
        // Match the reply to our request id (ignore any unrelated traffic).
        if (msg && msg.id === request.id) {
          clearTimeout(timer)
          resolve(msg)
        }
      }
    })

    await client.start()
    // The SDK's send() wants a strict JSONRPCMessage; the incoming body is
    // arbitrary JSON. If it's malformed the server replies with a JSON-RPC error,
    // which is the correct behavior — so cast at this boundary.
    await client.send(request as unknown as JSONRPCMessage)
    return await responsePromise
  } finally {
    await server.close().catch(() => {})
  }
}
