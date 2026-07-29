// GET /.well-known/oauth-authorization-server  (via rewrite → here)
//
// Dedicated non-catch-all function so the rewrite destination carries no
// dynamic param (rewriting into a [...catch-all] mangles the query on Vercel).
// Delegates to the shared handler.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import metadata from '../_lib/handlers/oauth/metadata.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await metadata(req, res)
}
