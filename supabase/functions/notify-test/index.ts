// notify-test — POST a sample notification payload at a user-supplied webhook
// URL so they can confirm their Slack/Discord/custom endpoint is wired.
//
// Runs server-side (not the renderer) so the outbound POST isn't blocked by
// CORS and the webhook URL never has to be reachable from the app origin.
//
// POST { webhook_url } → { ok: true } | { ok: false, error }
// Auth required (any signed-in user may test their own webhook).

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'

// Is `host` a name or numeric IP that must never be reachable from a
// server-side fetch (SSRF protection)? Covers loopback, private (RFC1918),
// carrier-grade NAT, link-local + the cloud metadata IP, and the unspecified
// address, plus IPv6 loopback and IPv4-mapped IPv6 forms. Non-numeric hosts
// are allowed unless they are localhost / *.internal (real DNS could still
// resolve to a private IP — see the note in the header; a full fix resolves
// then re-checks, which the Deno fetch sandbox does not expose cheaply).
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h === '' || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (h === '::1' || h === '::') return true
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) → test the trailing v4.
  const mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  const v4 = mapped ? mapped[1] : h
  const m = v4.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false // a hostname (not a literal IP) — allowed past the name checks above
  const [a, b] = [Number(m[1]), Number(m[2])]
  if (a === 0 || a === 127) return true // unspecified / loopback
  if (a === 10) return true // 10.0.0.0/8 private
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true // 192.168.0.0/16 private
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local (incl. metadata)
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  return false
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonResponse({ ok: false, error: 'authentication required' }, 401)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400)
  }

  const url = String(body.webhook_url ?? '').trim()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return jsonResponse({ ok: false, error: 'invalid webhook URL' }, 400)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return jsonResponse({ ok: false, error: 'webhook must be http(s)' }, 400)
  }
  // SSRF guard. This function runs with the service role and does a server-side
  // fetch, so a user-supplied URL must not be able to reach the project's own
  // network. Block by NAME (localhost/.internal) AND by numeric RANGE
  // (loopback, private, link-local, metadata, unspecified) — a name-only list
  // is trivially bypassed with 10.x / 192.168.x / 0.0.0.0.
  const host = parsed.hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
  if (isBlockedHost(host)) {
    return jsonResponse({ ok: false, error: 'webhook host not allowed' }, 400)
  }

  // A shape that reads sensibly in Slack ("text") and is harmless elsewhere.
  const payload = {
    text: '✅ TubeGhost test notification — your webhook is wired up correctly.',
    event: 'test',
    source: 'TubeGhost',
    sent_at: new Date().toISOString()
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    })
    clearTimeout(timer)
    if (!res.ok) {
      return jsonResponse({ ok: false, error: `endpoint returned ${res.status}` })
    }
    return jsonResponse({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ ok: false, error: msg })
  }
})
