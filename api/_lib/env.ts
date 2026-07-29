// Server-only env accessors for the MCP relay + device agent endpoints.
//
// Runs ONLY in Vercel serverless functions. Nothing here is VITE_-prefixed, so
// none of it reaches the renderer bundle. Every absolute URL is derived from
// PUBLIC_BASE_URL — never hardcode the host (per the Phase-3 host rule).

// The canonical public origin, no trailing slash, e.g. https://app.tubeghost.com.
// Set in Vercel (prod + preview) and in .env for local/ngrok dev.
export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '')

// Supabase — service role for privileged relay writes, anon for verifying a
// user's access token via the auth REST API (see session.ts).
export const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''

// Upstash Redis REST — the command bus + presence store.
export const UPSTASH_REDIS_REST_URL = (process.env.UPSTASH_REDIS_REST_URL ?? '').replace(/\/+$/, '')
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? ''

// ── Canonical OAuth / MCP strings (must match exactly, no trailing slash) ──
export const ISSUER = PUBLIC_BASE_URL
export const MCP_RESOURCE = `${PUBLIC_BASE_URL}/api/mcp`
export const JWT_AUDIENCE = MCP_RESOURCE

export function relayConfigured(): boolean {
  return Boolean(
    PUBLIC_BASE_URL &&
      SUPABASE_URL &&
      SUPABASE_SERVICE_ROLE_KEY &&
      SUPABASE_ANON_KEY &&
      UPSTASH_REDIS_REST_URL &&
      UPSTASH_REDIS_REST_TOKEN,
  )
}
