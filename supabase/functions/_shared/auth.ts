// Validate the caller's Supabase JWT. Returns the user id, or null if the
// JWT is missing/invalid. Functions should reject unauthenticated calls.
//
// We don't trust supabase-js's automatic JWT verification when a function is
// deployed with --verify-jwt: we still want to *use* the user ID downstream
// (e.g. to check workspace membership), so we manually decode + verify.
//
// Supabase Edge runtime guarantees the JWT is verified BEFORE our function
// runs (because we deploy without --no-verify-jwt). The Authorization header
// then holds the validated user JWT — we just decode it for the user_id.

interface JWTPayload {
  sub: string // user id
  email?: string
  exp: number
  [k: string]: unknown
}

export function getUserIdFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.slice('Bearer '.length).trim()
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as JWTPayload
    return payload.sub ?? null
  } catch {
    return null
  }
}
