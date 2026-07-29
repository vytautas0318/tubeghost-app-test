// Build a stateless McpServer with every contract tool registered against the
// ONE generic executor. Called fresh per request with the authenticated userId,
// which each tool handler closes over — a tool can only ever act for that user.
//
// The SDK's registerTool takes zod RAW SHAPES for input/output. Our contract
// stores full z.object(...) schemas, so we pass `.shape`. The SDK validates
// input against inputSchema before calling the handler and validates our
// structuredContent against outputSchema on the way out.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ZodObject, ZodRawShape } from 'zod'
import { TOOLS } from '../../lib/mcp/contract.js'
import { executeTool } from './executor.js'

// The contract's schemas are all z.object(...), so .shape is present. Typed
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
        outputSchema: shapeOf(tool.outputSchema),
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
