// Token exchange: trade the TubeProxies session (identity provider, ES256)
// for a REAL TP Browser GoTrue session via the auth-exchange edge function.
// See supabase/functions/auth-exchange/index.ts for the why.
//
// The exchange returns access_token + refresh_token for a TP Browser
// session whose sub == the TubeProxies user id. We install it into the TP
// Browser client via setSession(); supabase-js then auto-refreshes it
// like any normal session. We only re-run the exchange when the TP Browser
// client has no session (fresh login, or refresh token finally expired).

import type { SupabaseClient } from '@supabase/supabase-js'

interface ExchangeResponse {
  access_token: string
  refresh_token: string
  user: { id: string; email: string }
}

const tpbUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const tpbAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let inflight: Promise<boolean> | null = null

async function callExchange(tubeProxiesToken: string): Promise<ExchangeResponse | null> {
  if (!tpbUrl || !tpbAnon) return null
  try {
    const res = await fetch(`${tpbUrl}/functions/v1/auth-exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: tpbAnon,
        Authorization: `Bearer ${tpbAnon}`
      },
      body: JSON.stringify({ access_token: tubeProxiesToken })
    })
    if (!res.ok) return null
    const body = await res.json()
    if (!body?.access_token || !body?.refresh_token) return null
    return body as ExchangeResponse
  } catch {
    return null
  }
}

// Ensure the TP Browser client has a valid session, exchanging the current
// TubeProxies token for one if needed. Safe to call repeatedly + concurrently.
export async function ensureTPBrowserSession(
  tpBrowser: SupabaseClient,
  getTubeProxiesToken: () => Promise<string | null>
): Promise<boolean> {
  const { data } = await tpBrowser.auth.getSession()
  if (data.session) return true
  if (inflight) return inflight

  inflight = (async () => {
    const tpToken = await getTubeProxiesToken()
    if (!tpToken) return false
    const ex = await callExchange(tpToken)
    if (!ex) return false
    const { error } = await tpBrowser.auth.setSession({
      access_token: ex.access_token,
      refresh_token: ex.refresh_token
    })
    return !error
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

// Sign the TP Browser client out (call on TubeProxies sign-out).
export async function clearTPBrowserSession(tpBrowser: SupabaseClient): Promise<void> {
  await tpBrowser.auth.signOut()
}
