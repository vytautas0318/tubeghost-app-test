// Shared types + helpers for the executor and its relay-local split.

import type { ToolError } from '../../lib/mcp/contract.js'

export interface ExecOutcome {
  // The tool's structuredContent (success) OR an error envelope { error }.
  structuredContent: Record<string, unknown>
  // Short human-readable summary for the text content block.
  text: string
  isError: boolean
}

export function errorOutcome(e: ToolError): ExecOutcome {
  return { structuredContent: { error: e }, text: `${e.code}: ${e.message}`, isError: true }
}
