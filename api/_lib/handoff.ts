// Server-only helpers for the desktop OAuth handoff (see docs/desktop-oauth.md).
//
// Runs ONLY in Vercel serverless functions. GOOGLE_CLIENT_SECRET and the
// service-role key are read here and must never reach the renderer bundle —
// which is structurally guaranteed: this directory is outside Vite's `root`
// (src/renderer/), so the client build cannot even resolve it. None of these
// env vars carry a VITE_ prefix either.
//
// The pure decision logic lives in src/shared/oauth-handoff.ts, which the
// vitest suite covers. This module is the I/O half.

import { createHash, timingSafeEqual as nodeTimingSafeEqual, randomBytes } from 'node:crypto'

// ── Secrets + config (Vercel project env vars) ─────────────────────
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''
// The Google-registered redirect target — the public URL of the callback
// route: https://app.tubeghost.com/api/oauth/google/callback
export const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI ?? ''
// Where the browser is sent after the exchange. Same-origin by default, so a
// preview deployment bridges to its own /auth-client rather than production.
export const AUTH_CLIENT_PATH = '/auth-client'

// NOT VITE_-prefixed: the service-role key must never be bundled. Falls back
// to the public URL, which is the same host.
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export function isConfigured(): boolean {
  return Boolean(
    GOOGLE_CLIENT_ID &&
      GOOGLE_CLIENT_SECRET &&
      OAUTH_REDIRECT_URI &&
      SUPABASE_URL &&
      SERVICE_ROLE_KEY
  )
}

// ── Error codes (shared verbatim with the desktop app) ─────────────
export type HandoffError =
  | 'access_denied'
  | 'invalid_state'
  | 'exchange_failed'
  | 'expired'
  | 'already_claimed'
  | 'invalid_verifier'
  | 'rate_limited'
  | 'server_error'

// ── base64url + hashing ────────────────────────────────────────────
/** base64url(sha256(input)) — the challenge/nonce derivation, matched exactly
 *  by the desktop app. */
export function sha256Base64Url(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('base64url')
}

/** 16 random bytes, base64url — the sid. ~22 chars, 128 bits of entropy. */
export function randomSid(): string {
  return randomBytes(16).toString('base64url')
}

/** Constant-time compare.
 *
 *  Both operands are hashed first so the comparison always runs over equal,
 *  fixed-length buffers — otherwise Node's timingSafeEqual throws on a length
 *  mismatch, and that throw would itself leak the expected length. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return nodeTimingSafeEqual(ha, hb)
}

// ── Service-role REST access ───────────────────────────────────────
// Thin PostgREST fetch rather than pulling in supabase-js: these routes do a
// handful of queries and one of them (the atomic claim) is a raw delete with
// a representation preference anyway.
async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  })
}

export interface HandoffRow {
  sid: string
  challenge: string
  hashed_nonce: string
  id_token: string | null
}

export async function insertHandoff(row: {
  sid: string
  challenge: string
  hashed_nonce: string
  platform: string | null
  app_version: string | null
}): Promise<void> {
  const res = await rest('/auth_handoffs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  })
  if (!res.ok) throw new Error(`insertHandoff failed (${res.status})`)
}

/** Fetch a pending (unexpired) handoff by sid. Null when absent or expired. */
export async function getPendingHandoff(sid: string): Promise<HandoffRow | null> {
  const q =
    `/auth_handoffs?sid=eq.${encodeURIComponent(sid)}` +
    `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}` +
    `&select=sid,challenge,hashed_nonce,id_token`
  const res = await rest(q, { method: 'GET' })
  if (!res.ok) return null
  const rows = (await res.json()) as HandoffRow[]
  return rows[0] ?? null
}

export async function storeIdToken(sid: string, idToken: string): Promise<void> {
  const res = await rest(`/auth_handoffs?sid=eq.${encodeURIComponent(sid)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ id_token: idToken })
  })
  if (!res.ok) throw new Error(`storeIdToken failed (${res.status})`)
}

/** Delete expired rows. Best-effort — never blocks the caller. */
export async function sweepExpired(): Promise<void> {
  try {
    await rest(`/auth_handoffs?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    })
  } catch {
    /* opportunistic; pg_cron is the backstop */
  }
}

/** Atomically consume a claimable handoff.
 *
 *  Returns the row and removes it in ONE statement, so two concurrent claims
 *  cannot both succeed — the second sees zero rows. The verifier is checked by
 *  the caller AFTER this returns; a wrong verifier therefore also burns the
 *  sid, which is intended (a guessed sid gets exactly one attempt). */
export async function consumeHandoff(sid: string): Promise<HandoffRow | null> {
  const q =
    `/auth_handoffs?sid=eq.${encodeURIComponent(sid)}` +
    `&expires_at=gt.${encodeURIComponent(new Date().toISOString())}` +
    `&id_token=not.is.null`
  const res = await rest(q, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  })
  if (!res.ok) return null
  const rows = (await res.json()) as HandoffRow[]
  return rows[0] ?? null
}

/** Distinguish "never existed / wrong sid" from "existed but not claimable".
 *  Only called on the failure path, to pick the right error code. */
export async function handoffState(sid: string): Promise<'missing' | 'expired' | 'pending'> {
  const res = await rest(
    `/auth_handoffs?sid=eq.${encodeURIComponent(sid)}&select=expires_at,id_token`,
    { method: 'GET' }
  )
  if (!res.ok) return 'missing'
  const rows = (await res.json()) as { expires_at: string; id_token: string | null }[]
  const row = rows[0]
  if (!row) return 'missing'
  if (new Date(row.expires_at).getTime() <= Date.now()) return 'expired'
  return 'pending'
}

// ── Rate limiting ──────────────────────────────────────────────────
/** Returns true when the caller is within budget. Fails OPEN on error — a
 *  broken counter must not lock every user out of sign-in. */
export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const res = await rest('/rpc/bump_auth_rate_limit', {
      method: 'POST',
      body: JSON.stringify({
        p_bucket: bucket,
        p_limit: limit,
        p_window_seconds: windowSeconds
      })
    })
    if (!res.ok) return true
    return (await res.json()) === true
  } catch {
    return true
  }
}

/** Best-effort client IP. Vercel sets x-forwarded-for; the left-most entry is
 *  the origin client. */
export function clientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const xff = req.headers['x-forwarded-for']
  const raw = Array.isArray(xff) ? xff[0] : xff
  if (raw) return raw.split(',')[0].trim()
  const real = req.headers['x-real-ip']
  return (Array.isArray(real) ? real[0] : real) ?? 'unknown'
}

/** Absolute origin of the current deployment, so /auth-client redirects stay
 *  same-origin (a preview deploy bridges to its own copy, not production). */
export function originOf(req: {
  headers: Record<string, string | string[] | undefined>
}): string {
  const h = (k: string): string | undefined => {
    const v = req.headers[k]
    return Array.isArray(v) ? v[0] : v
  }
  const host = h('x-forwarded-host') ?? h('host') ?? 'app.tubeghost.com'
  const proto = h('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}
