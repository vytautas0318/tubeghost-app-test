// Own-account login 2FA for TubeGhost, via Supabase Auth native MFA (TOTP).
// This is DISTINCT from the Authenticator feature (lib/authenticator.ts), which
// stores TOTP secrets for external platforms. This one protects the user's
// TubeGhost sign-in.
//
// Flow: enroll() → returns a QR (svg/uri) + factorId; the user scans it and
// enters a code → verifyEnrollment(factorId, code) activates it. Status is read
// from listFactors(). unenroll() turns it off.

import { getSupabase } from '@/lib/supabase'

export interface TwoFactorStatus {
  enabled: boolean
  factorId: string | null
}

export interface EnrollResult {
  factorId: string
  qrSvg: string // inline SVG data (data:image/svg+xml,...) suitable for <img src>
  secret: string // manual-entry fallback
  uri: string // otpauth:// URI
}

// Read whether the caller has a verified TOTP factor on their login.
export async function get2faStatus(): Promise<TwoFactorStatus> {
  const c = getSupabase()
  if (!c) return { enabled: false, factorId: null }
  const { data, error } = await c.auth.mfa.listFactors()
  if (error || !data) return { enabled: false, factorId: null }
  const verified = data.totp?.find((f) => f.status === 'verified')
  return { enabled: Boolean(verified), factorId: verified?.id ?? null }
}

// Begin enrollment. Returns QR + secret to display in the Manage modal.
export async function enroll2fa(): Promise<{ result?: EnrollResult; error?: string }> {
  const c = getSupabase()
  if (!c) return { error: 'Supabase not configured' }
  // Clean up any stale unverified factor so re-opening Manage doesn't error on
  // the "factor already exists" case.
  // listFactors().totp only surfaces VERIFIED factors; unverified ones live in
  // `.all`. Clean up a stale unverified TOTP factor so re-opening Manage
  // doesn't hit "factor already exists".
  const { data: existing } = await c.auth.mfa.listFactors()
  const stale = existing?.all?.find((f) => f.factor_type === 'totp' && f.status === 'unverified')
  if (stale) await c.auth.mfa.unenroll({ factorId: stale.id })

  const { data, error } = await c.auth.mfa.enroll({ factorType: 'totp' })
  if (error || !data) return { error: error?.message ?? 'Enrollment failed' }
  return {
    result: {
      factorId: data.id,
      qrSvg: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri
    }
  }
}

// Complete enrollment by proving possession with a code from the app.
export async function verify2faEnrollment(
  factorId: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase()
  if (!c) return { ok: false, error: 'Supabase not configured' }
  const { data: challenge, error: chErr } = await c.auth.mfa.challenge({ factorId })
  if (chErr || !challenge) return { ok: false, error: chErr?.message ?? 'Challenge failed' }
  const { error: vErr } = await c.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim()
  })
  if (vErr) return { ok: false, error: vErr.message }
  return { ok: true }
}

// Turn 2FA off (unenroll the verified factor).
export async function disable2fa(factorId: string): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase()
  if (!c) return { ok: false, error: 'Supabase not configured' }
  const { error } = await c.auth.mfa.unenroll({ factorId })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
