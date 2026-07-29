// SPA consent screen for the MCP OAuth flow.
//
// Reached when Claude sends the browser to /api/oauth/authorize, which validates
// the request and 302s here with ?rid=<pending request id>. This page reuses the
// EXISTING Supabase login session: if the user isn't signed in, App-level gating
// bounces to /signin and returns here afterward. On approve we POST to
// /api/oauth/approve (with the Supabase access token) and navigate to
// the returned client redirect (back to Claude).

import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui'
import { useAuth } from '@/store/auth'

interface Details {
  clientName: string
  scopes: string[]
  devices: { name: string; online: boolean }[]
}

const SCOPE_LABEL: Record<string, string> = {
  mcp: 'Control your TubeGhost desktop app — create, launch, and manage browser profiles',
}

// Build a detailed, non-swallowed error from a failed response: HTTP status +
// the server's error code/description (JSON) or the raw body (HTML/text). Logs
// the raw body to the console so an unexpected shape is always diagnosable.
interface ServerError {
  error?: string
  error_description?: string
}
async function readError(res: Response, rid: string): Promise<string> {
  const raw = await res.text().catch(() => '')
  let parsed: ServerError | null = null
  try {
    parsed = raw ? (JSON.parse(raw) as ServerError) : null
  } catch {
    // Not JSON (e.g. an HTML 404 page) — log the raw body for diagnosis.
    console.error('[oauth/consent] non-JSON error response', { status: res.status, rid, raw: raw.slice(0, 500) })
  }
  const code = parsed?.error ?? (res.status === 404 ? 'not_found' : 'request_failed')
  const desc = parsed?.error_description ? ` — ${parsed.error_description}` : ''
  return `HTTP ${res.status} · ${code}${desc} (rid: ${rid || 'none'})`
}

export default function OAuthConsent(): React.ReactElement {
  const { session } = useAuth()
  const token = session?.access_token
  const rid = new URLSearchParams(window.location.search).get('rid') ?? ''

  const [details, setDetails] = React.useState<Details | null>(null)
  const [fetchError, setFetchError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // A missing rid is derived, not stateful — no effect needed for it.
  const error = !rid ? 'Missing authorization request.' : fetchError

  // No session yet: send the user to sign in and return to THIS consent URL
  // (rid preserved) rather than erroring. RedirectAuthRoutes honors the stash.
  function goSignIn(): void {
    try {
      sessionStorage.setItem('tg-oauth-return', window.location.pathname + window.location.search)
    } catch {
      /* private mode — flow still works, just no auto-return */
    }
    window.location.href = '/signin'
  }

  React.useEffect(() => {
    if (!rid) return
    if (!token) {
      goSignIn()
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/oauth/approve?rid=${encodeURIComponent(rid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          goSignIn()
          return
        }
        if (!res.ok) {
          if (!cancelled) setFetchError(await readError(res, rid))
          return
        }
        if (!cancelled) setDetails((await res.json()) as Details)
      } catch (e) {
        if (!cancelled) setFetchError(e instanceof Error ? `Network error: ${e.message}` : 'Could not load the request.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, rid])

  async function approve(): Promise<void> {
    if (!token) return
    setSubmitting(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/oauth/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rid }),
      })
      if (res.status === 401) {
        goSignIn()
        return
      }
      if (!res.ok) {
        setFetchError(await readError(res, rid))
        setSubmitting(false)
        return
      }
      const { redirect } = (await res.json()) as { redirect: string }
      window.location.href = redirect // back to Claude with ?code=...
    } catch (e) {
      setFetchError(e instanceof Error ? `Network error: ${e.message}` : 'Could not authorize.')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          border: '1px solid var(--line-2)',
          background: 'var(--panel)',
          borderRadius: 16,
          padding: 32,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={20} /> Connect to Claude
        </h1>
        {error && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--red)' }}>{error}</p>}
        {!details && !error && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--t3)' }}>Loading request…</p>}

        {details && (
          <>
            <p style={{ marginTop: 16, fontSize: 13, color: 'var(--t3)' }}>
              <span style={{ fontWeight: 600, color: 'var(--t1)' }}>{details.clientName}</span> is requesting access to
              your TubeGhost account.
            </p>

            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t4)' }}>
                This will allow it to
              </div>
              <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 13, color: 'var(--t2)' }}>
                {details.scopes.map((s) => (
                  <li key={s} style={{ marginTop: 4 }}>
                    {SCOPE_LABEL[s] ?? s}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t4)' }}>
                Devices Claude can reach
              </div>
              {details.devices.length === 0 ? (
                <p style={{ marginTop: 8, fontSize: 13, color: 'var(--t3)' }}>
                  No devices paired yet. You can authorize now, but pair a device in Settings → Claude before Claude can
                  do anything.
                </p>
              ) : (
                <ul style={{ marginTop: 8, listStyle: 'none', padding: 0 }}>
                  {details.devices.map((d) => (
                    <li key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 4 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: d.online ? 'var(--green)' : 'var(--t4)',
                        }}
                      />
                      {d.name}
                      <span style={{ color: 'var(--t4)' }}>{d.online ? 'online' : 'offline'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
              <Button onClick={() => void approve()} disabled={submitting} style={{ flex: 1 }}>
                {submitting ? 'Authorizing…' : 'Authorize'}
              </Button>
              <Button variant="ghost" onClick={() => window.close()}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
