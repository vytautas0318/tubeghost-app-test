// Device token minting, hashing, and Bearer authentication for the agent
// endpoints. Tokens are opaque random strings; only their sha256 hash is stored
// (devices.token_hash / refresh_token_hash). The plaintext is returned to the
// desktop app exactly once, at pair/refresh time.

import { createHash, randomBytes } from 'node:crypto'
import { getDeviceByTokenHash, type DeviceRow } from './db.js'

// Prefixes make a leaked token self-identifying in logs/alerts and keep the two
// kinds distinct even though they're stored in different columns.
const ACCESS_PREFIX = 'tgd_'
const REFRESH_PREFIX = 'tgr_'

/** 32 random bytes, base64url ≈ 43 chars, 256 bits. */
function randomToken(prefix: string): string {
  return prefix + randomBytes(32).toString('base64url')
}

export function mintTokenPair(): { token: string; refreshToken: string } {
  return { token: randomToken(ACCESS_PREFIX), refreshToken: randomToken(REFRESH_PREFIX) }
}

/** sha256(token) hex — what we persist and compare. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export type AgentAuthResult =
  | { ok: true; device: DeviceRow }
  | { ok: false; reason: 'missing' | 'invalid' | 'revoked' }

/** Authenticate an agent Bearer token against devices.token_hash.
 *
 *  Returns the device on success. A revoked device (revoked_at set, hashes
 *  nulled) can't match at all, but we also guard revoked_at explicitly so a
 *  race between revoke and this read still fails closed. */
export async function authenticateAgent(token: string | null): Promise<AgentAuthResult> {
  if (!token || !token.startsWith(ACCESS_PREFIX)) return { ok: false, reason: 'missing' }
  const device = await getDeviceByTokenHash('token_hash', hashToken(token))
  if (!device) return { ok: false, reason: 'invalid' }
  if (device.revoked_at) return { ok: false, reason: 'revoked' }
  return { ok: true, device }
}

/** Authenticate a refresh token against devices.refresh_token_hash. */
export async function authenticateRefresh(token: string | null): Promise<AgentAuthResult> {
  if (!token || !token.startsWith(REFRESH_PREFIX)) return { ok: false, reason: 'missing' }
  const device = await getDeviceByTokenHash('refresh_token_hash', hashToken(token))
  if (!device) return { ok: false, reason: 'invalid' }
  if (device.revoked_at) return { ok: false, reason: 'revoked' }
  return { ok: true, device }
}
