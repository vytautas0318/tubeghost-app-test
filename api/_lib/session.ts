// Verify a Supabase login session server-side, reusing the EXISTING auth system
// (no second identity provider). The SPA already holds a Supabase access token
// (storageKey 'tg-auth'); the dashboard endpoints send it as `Authorization:
// Bearer <access_token>`, and we verify it by asking Supabase's auth REST API
// who it belongs to — the same anon key the renderer uses.
//
// This is the ONLY server-side session check in the repo; the OAuth authorize
// endpoint (Phase 3) will reuse it to bind an MCP grant to a logged-in user.

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env.js'

export interface SessionUser {
  userId: string
  email: string | null
}

/** Extract a Bearer token from an Authorization header (case-insensitive). */
export function bearerFromHeader(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw) return null
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return m ? m[1].trim() : null
}

/** Verify a Supabase access token → the user, or null if invalid/expired.
 *
 *  Calls GET /auth/v1/user with the presented token as the Bearer and the anon
 *  key as apikey — GoTrue validates the JWT signature + expiry for us, so we
 *  don't ship the JWT secret to the edge. Fails CLOSED (null) on any error. */
export async function verifySession(accessToken: string): Promise<SessionUser | null> {
  if (!accessToken) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!res.ok) return null
    const user = (await res.json()) as { id?: string; email?: string | null }
    if (!user.id) return null
    return { userId: user.id, email: user.email ?? null }
  } catch {
    return null
  }
}

/** Convenience: pull the Bearer from a request and verify it in one step. */
export async function requireSession(header: string | string[] | undefined): Promise<SessionUser | null> {
  const token = bearerFromHeader(header)
  if (!token) return null
  return await verifySession(token)
}
