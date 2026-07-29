// Minimal HS256 JWT sign/verify on node:crypto — no dependency.
//
// The MCP access token is issued AND verified by this same server (the relay is
// the resource server too), so a symmetric secret is correct: no third party
// needs a public key. Secret = OAUTH_JWT_SECRET (a real server secret, never
// VITE_-prefixed). Rotating it invalidates outstanding access tokens (1h TTL),
// which is acceptable.
//
// aud is bound to MCP_RESOURCE exactly; verifyAccessToken rejects any other
// audience — this is the audience-confusion defense the MCP auth spec requires.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { JWT_AUDIENCE, ISSUER } from './env.js'

const SECRET = process.env.OAUTH_JWT_SECRET ?? ''
const ACCESS_TTL_SECONDS = 60 * 60 // 1 hour

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}
function sign(data: string): string {
  return createHmac('sha256', SECRET).update(data).digest('base64url')
}

export interface AccessClaims {
  sub: string // userId
  scope: string
  aud: string
  iss: string
  iat: number
  exp: number
  // Distinguishes MCP access tokens from anything else that might reuse the secret.
  typ: 'mcp_access'
}

export function signAccessToken(userId: string, scope: string): { token: string; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload: AccessClaims = {
    sub: userId,
    scope,
    aud: JWT_AUDIENCE,
    iss: ISSUER,
    iat: now,
    exp: now + ACCESS_TTL_SECONDS,
    typ: 'mcp_access',
  }
  const head = b64url(JSON.stringify(header))
  const body = b64url(JSON.stringify(payload))
  const sig = sign(`${head}.${body}`)
  return { token: `${head}.${body}.${sig}`, expiresIn: ACCESS_TTL_SECONDS }
}

/** Verify signature, expiry, issuer, typ, AND audience (must equal MCP_RESOURCE
 *  exactly — the apex is NOT an accepted alias). Returns claims or null. */
export function verifyAccessToken(token: string): AccessClaims | null {
  if (!SECRET) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [head, body, sig] = parts

  const expected = sign(`${head}.${body}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let claims: AccessClaims
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AccessClaims
  } catch {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (claims.typ !== 'mcp_access') return null
  if (claims.iss !== ISSUER) return null
  if (claims.aud !== JWT_AUDIENCE) return null // audience-confusion guard
  if (typeof claims.exp !== 'number' || claims.exp < now) return null
  if (!claims.sub) return null
  return claims
}

export function jwtConfigured(): boolean {
  return Boolean(SECRET)
}
