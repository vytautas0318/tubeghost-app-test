// Durable OAuth 2.1 state in Redis (all keys TTL'd). Serverless has no memory
// between invocations, so registered clients, pending authorize requests, auth
// codes, and refresh tokens all live here.
//
// Keys:
//   oauth:client:{clientId}       registered client JSON (DCR), 90d sliding
//   oauth:req:{rid}               pending authorize request, TTL 10m
//   oauth:code:{code}             issued authorization code, TTL 60s, single-use
//   oauth:refresh:{tokenHash}     refresh token record, TTL 30d, rotates on use

import { createHash, randomBytes } from 'node:crypto'
import { redis } from './bus.js'

const CLIENT_TTL = 60 * 60 * 24 * 90 // 90 days
const REQUEST_TTL = 60 * 10 // 10 minutes
const CODE_TTL = 60 // 60 seconds, single-use
const REFRESH_TTL = 60 * 60 * 24 * 30 // 30 days

export function randomId(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
export function sha256hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// ── Registered clients (Dynamic Client Registration) ───────────────
export interface OAuthClient {
  client_id: string
  client_name?: string
  redirect_uris: string[]
  // Public clients (Claude) use PKCE, no secret. Kept for spec completeness.
  token_endpoint_auth_method: 'none'
  created_at: number
}

export async function putClient(c: OAuthClient): Promise<void> {
  await redis().set(`oauth:client:${c.client_id}`, JSON.stringify(c), { ex: CLIENT_TTL })
}
export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const raw = await redis().get<string>(`oauth:client:${clientId}`)
  if (!raw) return null
  const c = typeof raw === 'string' ? (JSON.parse(raw) as OAuthClient) : (raw as OAuthClient)
  // Sliding expiry: an actively-used client shouldn't be evicted.
  await redis().expire(`oauth:client:${clientId}`, CLIENT_TTL)
  return c
}

// ── Pending authorize request (survives the login+consent round-trip) ──
export interface AuthRequest {
  rid: string
  client_id: string
  redirect_uri: string
  state: string | null
  scope: string
  code_challenge: string // PKCE, S256 only
  code_challenge_method: 'S256'
  resource: string | null // RFC 8707 resource indicator
}

export async function putRequest(r: AuthRequest): Promise<void> {
  await redis().set(`oauth:req:${r.rid}`, JSON.stringify(r), { ex: REQUEST_TTL })
}
export async function getRequest(rid: string): Promise<AuthRequest | null> {
  const raw = await redis().get<string>(`oauth:req:${rid}`)
  if (!raw) return null
  return typeof raw === 'string' ? (JSON.parse(raw) as AuthRequest) : (raw as AuthRequest)
}
export async function delRequest(rid: string): Promise<void> {
  await redis().del(`oauth:req:${rid}`)
}

// ── Authorization codes (single-use, bound to user + PKCE) ─────────
export interface AuthCode {
  code: string
  client_id: string
  user_id: string
  redirect_uri: string
  scope: string
  code_challenge: string
  resource: string | null
}

export async function putCode(c: AuthCode): Promise<void> {
  await redis().set(`oauth:code:${c.code}`, JSON.stringify(c), { ex: CODE_TTL })
}
/** Atomically read-and-delete a code (single use). GETDEL so a replayed code
 *  finds nothing. */
export async function consumeCode(code: string): Promise<AuthCode | null> {
  const raw = await redis().getdel<string>(`oauth:code:${code}`)
  if (!raw) return null
  return typeof raw === 'string' ? (JSON.parse(raw) as AuthCode) : (raw as AuthCode)
}

// ── Refresh tokens (rotate on use; reuse revokes the chain) ────────
export interface RefreshRecord {
  user_id: string
  client_id: string
  scope: string
  resource: string | null
  // Chain id shared across every rotation of one login. Reuse of a rotated
  // token deletes the whole chain (see consumeRefresh).
  chain: string
}

// A refresh token is `{chain}.{secret}` so the chain is recoverable from the
// token itself. This is what makes reuse-of-a-rotated-token detectable: even
// after the active-token key is deleted, we can still read the chain's used-set.
export function newRefreshToken(chain: string): { token: string; secret: string } {
  const secret = randomId(32)
  return { token: `${chain}.${secret}`, secret }
}
export function splitRefreshToken(token: string): { chain: string; secret: string } | null {
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  return { chain: token.slice(0, dot), secret: token.slice(dot + 1) }
}

/** Store the ACTIVE refresh token for a chain (keyed by hash of the secret). */
export async function putRefresh(secretHash: string, rec: RefreshRecord): Promise<void> {
  await redis().set(`oauth:refresh:${rec.chain}:${secretHash}`, JSON.stringify(rec), { ex: REFRESH_TTL })
}

export type ConsumeResult =
  | { kind: 'ok'; rec: RefreshRecord } // first use — rotate
  | { kind: 'reuse'; chain: string } // already-rotated token replayed — REVOKE CHAIN
  | { kind: 'unknown' } // never issued / random — just reject

/** Atomically consume a refresh token by (chain, secretHash).
 *
 *  On first use, GETDEL the active-token key and add the hash to the chain's
 *  used-set. A later replay finds no active key BUT is present in the used-set →
 *  reuse (revoke the chain). A hash in neither is unknown. */
export async function consumeRefresh(chain: string, secretHash: string): Promise<ConsumeResult> {
  const raw = await redis().getdel<string>(`oauth:refresh:${chain}:${secretHash}`)
  if (raw) {
    const rec = typeof raw === 'string' ? (JSON.parse(raw) as RefreshRecord) : (raw as RefreshRecord)
    await redis().sadd(`oauth:used:${chain}`, secretHash)
    await redis().expire(`oauth:used:${chain}`, REFRESH_TTL)
    return { kind: 'ok', rec }
  }
  if ((await redis().sismember(`oauth:used:${chain}`, secretHash)) === 1) {
    return { kind: 'reuse', chain }
  }
  return { kind: 'unknown' }
}

/** Revoke a whole chain: delete every active token key + the used-set. Uses a
 *  key scan scoped to the chain prefix (bounded — one login's rotations). */
export async function revokeChain(chain: string): Promise<void> {
  // Active tokens are oauth:refresh:{chain}:*. Redis SCAN via the REST client.
  const pattern = `oauth:refresh:${chain}:*`
  let cursor = '0'
  do {
    const [next, keys] = await redis().scan(cursor, { match: pattern, count: 100 })
    cursor = next
    if (keys.length) await redis().del(...keys)
  } while (cursor !== '0')
  await redis().del(`oauth:used:${chain}`)
}
