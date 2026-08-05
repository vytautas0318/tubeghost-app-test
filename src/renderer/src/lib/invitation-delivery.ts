// Invitation delivery — the link the invitee clicks, and the edge-function call
// that emails it. Split out of lib/invitations.ts (which owns the CRUD RPCs) to
// keep both files under the 250-line rule; invitations.ts re-exports everything
// here so `@/lib/invitations` stays the single import site for callers.

import { getSupabase } from '@/lib/supabase'

// ── Invitation link ──────────────────────────────────────────────────────────

// Base origin of the web bridge that hosts `/invite/:token` (AcceptInvite).
// Prefer the explicit env override, then the current origin — but only when
// that origin is a real http(s) one, so the Electron renderer's `file://`
// (origin === 'null') can never leak into a link we email out.
const ENV_BASE = import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined
const APP_BASE = (
  ENV_BASE && /^https?:\/\//.test(ENV_BASE)
    ? ENV_BASE
    : typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)
      ? window.location.origin
      : 'https://app.tubeghost.com'
).replace(/\/+$/, '')

// The link we email and the owner copies. It MUST be https, not the raw
// `tubeghost://` scheme: mail clients (Gmail, Outlook, Apple Mail) refuse to
// linkify or open unknown custom schemes, so a `tubeghost://…` button in an
// email is dead text — and it is useless to an invitee who hasn't installed
// the desktop app yet. The https page (AcceptInvite) fires the deep link on
// load and falls back to a download prompt.
export function invitationLink(token: string): string {
  return `${APP_BASE}/invite/${token}`
}

// The raw custom-scheme URL, for callers that specifically need to hand off to
// the installed desktop app (AcceptInvite's redirect + manual retry link).
export function invitationDeepLink(token: string): string {
  return `tubeghost://invite/${token}`
}

// ── Email delivery ───────────────────────────────────────────────────────────

// Delivery outcome of the invitation email, surfaced alongside a successful
// invite so the UI can distinguish "invited + emailed" from "invited but the
// email didn't go out" (this failure used to be silently swallowed, so an
// invitee who never got the email looked identical to a delivered one).
//   'sent'         → the mail provider accepted the message
//   'not-delivered'→ function ran but nothing was sent (no provider configured,
//                    or the provider rejected the send)
//   'failed'       → the call itself errored (network / function error)
export type EmailDelivery = 'sent' | 'not-delivered' | 'failed'

// `deliveryReason` is the edge function's explanation when delivery != 'sent'
// (e.g. "No mail provider is configured…"), so an admin can tell a
// misconfiguration apart from a transient failure.
export interface DeliveryOutcome {
  delivery: EmailDelivery
  deliveryReason?: string
}

// Ask the edge function to email the invitee and report the outcome. Never
// throws — returns a status the caller can surface.
export async function sendInvitationEmail(invitationId: string): Promise<DeliveryOutcome> {
  const c = getSupabase()
  if (!c) return { delivery: 'failed', deliveryReason: 'Supabase is not configured.' }
  try {
    const { data, error } = await c.functions.invoke('send-invitation-email', {
      body: { invitation_id: invitationId }
    })
    if (error) {
      // supabase-js puts the function's response body on error.context — read it
      // so the caller can show the real cause rather than a generic failure.
      let detail = ''
      try {
        const ctx = (error as { context?: Response }).context
        detail = ctx ? await ctx.clone().text() : ''
      } catch {
        detail = ''
      }
      console.error('[sendInvitationEmail] invoke error:', error.message, '| body:', detail)
      return {
        delivery: 'failed',
        deliveryReason: safeJson<{ error?: string }>(detail)?.error ?? error.message
      }
    }
    const res = (data ?? null) as { delivered?: boolean; reason?: string } | null
    if (res?.delivered === true) return { delivery: 'sent' }
    console.error('[sendInvitationEmail] function ran but delivered=false. data:', data)
    return { delivery: 'not-delivered', deliveryReason: res?.reason }
  } catch (e) {
    console.error('[sendInvitationEmail] threw:', (e as Error).message)
    return { delivery: 'failed', deliveryReason: (e as Error).message }
  }
}

// One phrasing for "the invite exists but no email went out", shared by the
// create and resend paths. Includes the server's reason when there is one, so
// an admin sees the actual cause (e.g. no RESEND_API_KEY set) instead of
// guessing, and always points at the copy-link fallback.
export function undeliveredMessage(email: string, reason?: string): string {
  const why = reason ? ` ${reason}` : ''
  return (
    `${email} was invited, but the email couldn't be delivered.${why} ` +
    'Copy the invite link and share it directly.'
  )
}

function safeJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
