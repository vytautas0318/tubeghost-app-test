import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ensureTPBrowserSession, clearTPBrowserSession } from '@/lib/token-exchange'

// ── Dual-client setup ──────────────────────────────────────────────
// TubeProxies is the SINGLE identity provider (ES256). TP Browser (this
// app's data project) can't verify a raw TubeProxies token and has no
// pre-populated auth.users, so we bridge the two with a token EXCHANGE:
//
//   * tubeProxies client — owns identity: login / signup / Google OAuth /
//     token refresh. persistSession + autoRefreshToken here.
//   * tpBrowser client — app data. Runs a REAL TP Browser GoTrue session
//     whose sub == the TubeProxies user id, obtained by exchanging the
//     TubeProxies token at the auth-exchange edge function (see
//     lib/token-exchange.ts + supabase/functions/auth-exchange). Because
//     it's a genuine TP Browser session, PostgREST accepts it and
//     supabase-js auto-refreshes it; RLS sees auth.uid() = public.users id.
//
// Call ensureDataSession() after login / on app init to establish the TP
// Browser session before issuing data queries.
//
// Renderer-only: anon keys only (never service-role — see preload guard).

// TP Browser (data)
const tpbUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const tpbAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// TubeProxies (identity + commerce)
const tpUrl = import.meta.env.VITE_TUBEPROXIES_SUPABASE_URL as string | undefined
const tpAnon = import.meta.env.VITE_TUBEPROXIES_SUPABASE_ANON_KEY as string | undefined

let tubeProxiesClient: SupabaseClient | null = null
let tpBrowserClient: SupabaseClient | null = null

// The identity provider. Holds the session; refreshes tokens.
export function getTubeProxies(): SupabaseClient | null {
  if (!tpUrl || !tpAnon) return null
  if (!tubeProxiesClient) {
    tubeProxiesClient = createClient(tpUrl, tpAnon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce', // web OAuth redirect flow (see store/auth.ts + pages/AuthCallback.tsx)
        storageKey: 'tp-identity-auth' // distinct from the data client's storage
      }
    })
  }
  return tubeProxiesClient
}

// The data project. Runs its own exchanged GoTrue session.
export function getTPBrowser(): SupabaseClient | null {
  if (!tpbUrl || !tpbAnon) return null
  if (!tpBrowserClient) {
    tpBrowserClient = createClient(tpbUrl, tpbAnon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'tpb-data-auth' // distinct from the identity client's storage
      }
    })
  }
  return tpBrowserClient
}

// Establish (or confirm) the TP Browser data session by exchanging the
// current TubeProxies token. Call after login and on app init. Returns
// false if there is no TubeProxies session or the exchange failed (e.g.
// the user isn't mirrored yet).
export async function ensureDataSession(): Promise<boolean> {
  const tpb = getTPBrowser()
  const tp = getTubeProxies()
  if (!tpb || !tp) return false
  return ensureTPBrowserSession(tpb, async () => {
    const {
      data: { session }
    } = await tp.auth.getSession()
    return session?.access_token ?? null
  })
}

// Tear down the TP Browser data session (call on sign-out).
export async function clearDataSession(): Promise<void> {
  const tpb = getTPBrowser()
  if (tpb) await clearTPBrowserSession(tpb)
}

// ── Back-compat shim ───────────────────────────────────────────────
// The whole data layer (lib/proxies.ts, lib/profiles.ts, …) calls
// getSupabase(). Point it at the TP Browser (data) client so those
// modules keep working unchanged. Auth code uses getTubeProxies().
export function getSupabase(): SupabaseClient | null {
  return getTPBrowser()
}

export const isSupabaseConfigured = (): boolean =>
  Boolean(tpbUrl && tpbAnon && tpUrl && tpAnon)

// True when only the data project is configured (TubeProxies identity
// env missing) — surfaces a clear setup error instead of "login failed".
export const isIdentityConfigured = (): boolean => Boolean(tpUrl && tpAnon)
