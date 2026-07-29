// ─────────────────────────────────────────────────────────────────────────
// TubeGhost MCP tool contract — SINGLE SOURCE OF TRUTH.
//
// This file (and the modules it re-exports: errors, schemas, registry) is the
// shared contract between two repos:
//   • tubeghost-app     — the thin MCP relay (this repo). Registers TOOLS,
//                         validates input, enqueues a command, returns output.
//   • tubeghost-desktop — the Electron device agent. Reads TOOLS to know which
//                         tools to implement and validates its results against
//                         the output schemas before returning them.
//
// COPY-SYNCABLE RULE: nothing in lib/mcp/* may import Next.js, @vercel/node,
// node:*, the Supabase client, or any server/relay code. zod v4 only. Copy the
// whole lib/mcp/ folder into the Electron repo verbatim to stay in sync.
// ─────────────────────────────────────────────────────────────────────────

export * from './errors'
export * from './schemas'
export * from './registry'
