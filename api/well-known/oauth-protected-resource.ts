// GET /.well-known/oauth-protected-resource  (+ /api/mcp variant, via rewrite)
//
// Dedicated non-catch-all function (see oauth-authorization-server.ts for why).
// Delegates to the shared resource-metadata handler.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import resourceMetadata from '../_lib/handlers/oauth/resource-metadata.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await resourceMetadata(req, res)
}
