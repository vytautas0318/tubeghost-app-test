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

// Keyed by the SINGLE-segment route. The consent step is /api/oauth/approve
// (single segment) — a nested /authorize/approve path conflicts with this
// catch-all on Vercel (routes to neither), so we keep every route flat.
const ROUTES: Record<string, Handler> = {
  authorize,
  approve,
  metadata,
  register,
  'resource-metadata': resourceMetadata,
  revoke,
  token,
}

/** Derive the sub-route. Vercel populates this differently for direct vs
 *  rewritten requests:
 *   - direct  /api/oauth/token        → req.query.route = ['token']
 *   - rewrite /.well-known/... → dest  → req.url keeps the ORIGINAL path but the
 *       destination's :route segment arrives as ?route=metadata
 *  So: prefer the query param (covers both), fall back to parsing the path. */
function routeKey(req: VercelRequest): string {
  const raw = req.query.route
  const fromQuery = Array.isArray(raw) ? raw.join('/') : (raw ?? '')
  if (fromQuery) return fromQuery.replace(/\/+$/, '')
  const path = (req.url ?? '').split('?')[0]
  const m = /\/api\/oauth\/(.+)$/.exec(path)
  return m ? m[1].replace(/\/+$/, '') : ''
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const key = routeKey(req)
  const fn = ROUTES[key]
  if (!fn) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  await fn(req, res)
}
