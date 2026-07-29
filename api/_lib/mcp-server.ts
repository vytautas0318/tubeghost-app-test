// Build a stateless McpServer with every contract tool registered against the
// ONE generic executor. Called fresh per request with the authenticated userId,
// which each tool handler closes over — a tool can only ever act for that user.
//
// The SDK's registerTool takes a zod RAW SHAPE for inputSchema (validated before
// the handler runs). We deliberately DO NOT register an outputSchema: the generic
// executor returns a UNION of shapes for every tool — the success payload, a
// structured { error } envelope (NO_DEVICE, WRITE_DISABLED, DEVICE_ERROR…), or a
// { command_id, status:"running" } handle when a sync tool times out waiting for
// the device. A strict outputSchema would make the SDK reject those legitimate
// non-success shapes with a validation error ("internal response mismatch"),
// which is a bug. The per-tool output shape still lives in the contract for the
// DEVICE side to honor; the relay just doesn't enforce it on the way out.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ZodObject, ZodRawShape } from 'zod'
import { TOOLS } from '../../lib/mcp/contract.js'
import { executeTool } from './executor.js'

// The contract's input schemas are all z.object(...), so .shape is present. Typed
// loosely here because the SDK's generic registerTool signature is structural.
function shapeOf(schema: unknown): ZodRawShape {
  return (schema as ZodObject<ZodRawShape>).shape
}

export function buildServer(userId: string): McpServer {
  const server = new McpServer(
    { name: 'tubeghost', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: shapeOf(tool.inputSchema),
        // No outputSchema — see the note at the top of this file.
        annotations: {
          title: tool.title,
          ...(tool.annotations.readOnlyHint !== undefined ? { readOnlyHint: tool.annotations.readOnlyHint } : {}),
          ...(tool.annotations.destructiveHint !== undefined
            ? { destructiveHint: tool.annotations.destructiveHint }
            : {}),
          ...(tool.annotations.idempotentHint !== undefined
            ? { idempotentHint: tool.annotations.idempotentHint }
            : {}),
        },
      },
      async (args: Record<string, unknown>) => {
        const outcome = await executeTool(userId, tool.name, args)
        return {
          content: [{ type: 'text' as const, text: outcome.text }],
          structuredContent: outcome.structuredContent,
          isError: outcome.isError,
        }
      },
    )
  }

  return server
}
