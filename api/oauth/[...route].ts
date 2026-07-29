// Catch-all router for the MCP OAuth 2.1 endpoints. Consolidates
// authorize / authorize/approve / metadata / register / resource-metadata /
// revoke / token into ONE serverless function (Vercel Hobby caps at 12). Logic
// is unchanged — handlers live in api/_lib/handlers/oauth/ and are dispatched
// here by the joined path segments.
//
// NOTE: the existing Google sign-in bridge stays at api/oauth/google/* — those
// are separate functions and are NOT routed here (a more specific route wins).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import authorize from '../_lib/handlers/oauth/authorize.js'
import approve from '../_lib/handlers/oauth/approve.js'
import metadata from '../_lib/handlers/oauth/metadata.js'
import register from '../_lib/handlers/oauth/register.js'
import resourceMetadata from '../_lib/handlers/oauth/resource-metadata.js'
import revoke from '../_lib/handlers/oauth/revoke.js'
import token from '../_lib/handlers/oauth/token.js'

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void

// Keyed by the joined route path ('/'-delimited).
const ROUTES: Record<string, Handler> = {
  authorize,
  'authorize/approve': approve,
  metadata,
  register,
  'resource-metadata': resourceMetadata,
  revoke,
  token,
}

// TEMPORARY diagnostic — GET /api/oauth/debug reports which relay env vars are
// PRESENT (names only, never values) + whether cross-boundary imports bundle.
// Remove after the config is confirmed working.
async function debug(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const REQUIRED = [
    'PUBLIC_BASE_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'OAUTH_JWT_SECRET',
  ]
  const present: Record<string, boolean> = {}
  for (const k of REQUIRED) present[k] = Boolean(process.env[k])
  // Also report the Vercel KV_* aliases + whether the relay resolves Redis.
  const kv = {
    KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
    KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
  }
  const { relayConfigured } = await import('../_lib/env.js')
  res.status(200).json({ present, kv, relayConfigured: relayConfigured(), node: process.version })
}

/** Derive the sub-route from the actual URL path, not the dynamic param —
 *  req.url is always populated correctly, including on rewritten /.well-known
 *  paths and regardless of the catch-all param name Vercel chooses. */
function routeKey(req: VercelRequest): string {
  const path = (req.url ?? '').split('?')[0]
  // Strip the /api/oauth/ prefix; what remains is e.g. "metadata" or
  // "authorize/approve". Also handle the rewritten metadata targets.
  const m = /\/api\/oauth\/(.+)$/.exec(path)
  return m ? m[1].replace(/\/+$/, '') : ''
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const key = routeKey(req)
  if (key === 'debug') {
    await debug(req, res)
    return
  }
  const fn = ROUTES[key]
  if (!fn) {
    res.status(404).json({ error: 'not_found', key, url: req.url })
    return
  }
  await fn(req, res)
}
