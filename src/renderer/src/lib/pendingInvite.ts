// Survives an invite token across the auth flow — including the Google
// sign-in round-trip out to accounts.google.com and back to /auth/callback,
// which drops any URL query params. sessionStorage survives that full-page
// navigation (same origin) but clears when the tab closes, so a stale token
// can't linger forever.
//
// Used by SignIn / SignUp (stash on arrival with ?invite=) and by the
// post-auth redirect + InvitationBanner (take + resume the accept flow).

const KEY = 'tubeghost:pendingInvite'

// Basic guard: tokens are opaque url-safe strings; reject anything with a slash
// or whitespace so a malformed value can't build a bad /invite/<token> route.
function isPlausibleToken(v: string): boolean {
  return v.length > 0 && v.length <= 256 && !/[\s/#?]/.test(v)
}

export function stashPendingInvite(token: string): void {
  try {
    if (isPlausibleToken(token)) sessionStorage.setItem(KEY, token)
  } catch {
    /* storage unavailable — deep link + InvitationBanner still work */
  }
}

// Read the pending token WITHOUT clearing it. Use when you only need to know
// whether one exists (e.g. deciding a redirect target you may not reach).
export function peekPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

// Read + clear — the token is single-use once you actually route to the accept
// screen, so a later navigation doesn't bounce back into it.
export function takePendingInvite(): string | null {
  try {
    const v = sessionStorage.getItem(KEY)
    if (v) sessionStorage.removeItem(KEY)
    return v
  } catch {
    return null
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* no-op */
  }
}
