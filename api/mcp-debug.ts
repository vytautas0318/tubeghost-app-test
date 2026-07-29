// TEMPORARY diagnostic — reports which relay env vars are PRESENT (names only,
// never values) and whether the MCP modules import cleanly. DELETE after use.

import type { VercelRequest, VercelResponse } from '@vercel/node'

const REQUIRED = [
  'PUBLIC_BASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'OAUTH_JWT_SECRET',
]

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const present: Record<string, boolean> = {}
  for (const k of REQUIRED) present[k] = Boolean(process.env[k])

  // Does the cross-boundary contract import (../../lib/mcp) survive bundling?
  let contractImport = 'ok'
  let toolCount = -1
  try {
    const mod = await import('../lib/mcp/contract.js')
    toolCount = (mod as { TOOLS: unknown[] }).TOOLS.length
  } catch (e) {
    contractImport = e instanceof Error ? e.message : 'failed'
  }

  // Does the MCP SDK import survive bundling?
  let sdkImport = 'ok'
  try {
    await import('@modelcontextprotocol/sdk/server/mcp.js')
  } catch (e) {
    sdkImport = e instanceof Error ? e.message : 'failed'
  }

  res.status(200).json({
    present,
    allRequiredPresent: REQUIRED.every((k) => present[k]),
    contractImport,
    toolCount,
    sdkImport,
    node: process.version,
  })
}
