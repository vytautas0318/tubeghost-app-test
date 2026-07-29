// POST /api/oauth/token — OAuth 2.1 token endpoint.
//
// Grants:
//   authorization_code — exchange a single-use code (+ PKCE verifier) for a
//     JWT access token (1h, aud=MCP_RESOURCE) and a rotating refresh token.
//     PKCE S256 is REQUIRED and verified here.
//   refresh_token — rotate: issue a new access + refresh token, invalidate the
//     presented one. A replay of an already-rotated token REVOKES THE WHOLE
//     CHAIN (reuse detection).
//
// Public clients only (no client_secret). Errors follow RFC 6749 §5.2 shapes.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, timingSafeEqual } from 'node:crypto'
import { relayConfigured, MCP_RESOURCE } from '../../env.js'
import { signAccessToken, jwtConfigured } from '../../jwt.js'
import {
  consumeCode,
  consumeRefresh,
  newRefreshToken,
  putRefresh,
  randomId,
  revokeChain,
  sha256hex,
  splitRefreshToken,
  type RefreshRecord,
} from '../../oauth-store.js'

function parseBody(req: VercelRequest): Record<string, string> {
  // The token endpoint receives application/x-www-form-urlencoded per spec;
  // @vercel/node parses that into req.body. Fall back to JSON just in case.
  if (typeof req.body === 'string') {
    const out: Record<string, string> = {}
    new URLSearchParams(req.body).forEach((v, k) => (out[k] = v))
    if (Object.keys(out).length) return out
    try {
      return JSON.parse(req.body) as Record<string, string>
    } catch {
      return {}
    }
  }
  return (req.body ?? {}) as Record<string, string>
}

function tokenErr(res: VercelResponse, status: number, error: string, desc?: string): void {
  res.status(status).json({ error, ...(desc ? { error_description: desc } : {}) })
}

/** PKCE S256: BASE64URL(SHA256(verifier)) must equal the stored challenge. */
function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier) return false
  const computed = createHash('sha256').update(verifier).digest('base64url')
  const a = Buffer.from(computed)
  const b = Buffer.from(challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function issue(res: VercelResponse, rec: RefreshRecord): Promise<void> {
  const { token: accessToken, expiresIn } = signAccessToken(rec.user_id, rec.scope)
  const { token: refreshToken, secret } = newRefreshToken(rec.chain)
  try {
    await putRefresh(sha256hex(secret), rec)
  } catch {
    tokenErr(res, 500, 'server_error')
    return
  }
  res.status(200).json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: rec.scope,
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    tokenErr(res, 405, 'invalid_request', 'POST only')
    return
  }
  if (!relayConfigured() || !jwtConfigured()) {
    tokenErr(res, 500, 'server_error')
    return
  }

  const body = parseBody(req)
  const grant = body.grant_type

  // ── authorization_code ────────────────────────────────────────────
  if (grant === 'authorization_code') {
    const code = body.code ?? ''
    const verifier = body.code_verifier ?? ''
    const clientId = body.client_id ?? ''
    const redirectUri = body.redirect_uri ?? ''
    if (!code || !verifier) {
      tokenErr(res, 400, 'invalid_request', 'code and code_verifier are required')
      return
    }

    const rec = await consumeCode(code) // single-use (GETDEL)
    if (!rec) {
      tokenErr(res, 400, 'invalid_grant', 'code invalid, expired, or already used')
      return
    }
    // Bind the exchange to the same client + redirect_uri the code was issued to.
    if (rec.client_id !== clientId || rec.redirect_uri !== redirectUri) {
      tokenErr(res, 400, 'invalid_grant', 'client_id/redirect_uri mismatch')
      return
    }
    // PKCE S256 verification (REQUIRED).
    if (!verifyPkce(verifier, rec.code_challenge)) {
      tokenErr(res, 400, 'invalid_grant', 'PKCE verification failed')
      return
    }
    // RFC 8707: if the client asked for a resource, it must be our MCP resource.
    if (rec.resource && rec.resource !== MCP_RESOURCE) {
      tokenErr(res, 400, 'invalid_target', 'unsupported resource')
      return
    }

    await issue(res, {
      user_id: rec.user_id,
      client_id: rec.client_id,
      scope: rec.scope,
      resource: MCP_RESOURCE,
      chain: randomId(12),
    })
    return
  }

  // ── refresh_token (rotate; reuse revokes chain) ───────────────────
  if (grant === 'refresh_token') {
    const presented = body.refresh_token ?? ''
    const parts = presented ? splitRefreshToken(presented) : null
    if (!parts) {
      tokenErr(res, 400, 'invalid_request', 'refresh_token required')
      return
    }
    const outcome = await consumeRefresh(parts.chain, sha256hex(parts.secret))
    if (outcome.kind === 'reuse') {
      // A previously-rotated token was replayed → revoke the entire chain.
      await revokeChain(outcome.chain)
      tokenErr(res, 400, 'invalid_grant', 'refresh token reuse detected; session revoked')
      return
    }
    if (outcome.kind === 'unknown') {
      tokenErr(res, 400, 'invalid_grant', 'refresh_token invalid or expired')
      return
    }
    await issue(res, outcome.rec)
    return
  }

  tokenErr(res, 400, 'unsupported_grant_type')
}
