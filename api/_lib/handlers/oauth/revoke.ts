// POST /api/oauth/revoke — RFC 7009 token revocation.
//
// Accepts a refresh_token and revokes its entire chain (all rotations). Access
// tokens are stateless JWTs (1h) and are not individually revocable — that's an
// accepted tradeoff of the short TTL. Always returns 200 per RFC 7009 §2.2
// (revoking an unknown token is not an error).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { relayConfigured } from '../../env.js'
import { revokeChain, splitRefreshToken } from '../../oauth-store.js'

function parseBody(req: VercelRequest): Record<string, string> {
  if (typeof req.body === 'string') {
    const out: Record<string, string> = {}
    new URLSearchParams(req.body).forEach((v, k) => (out[k] = v))
    return out
  }
  return (req.body ?? {}) as Record<string, string>
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  if (!relayConfigured()) {
    res.status(500).json({ error: 'server_error' })
    return
  }

  const token = parseBody(req).token ?? ''
  const parts = token ? splitRefreshToken(token) : null
  if (parts) {
    await revokeChain(parts.chain).catch(() => {})
  }
  // RFC 7009: success regardless of whether the token existed.
  res.status(200).json({ ok: true })
}
