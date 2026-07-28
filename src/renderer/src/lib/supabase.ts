import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── Single-client setup ────────────────────────────────────────────
// This app authenticates DIRECTLY against its own Supabase project
// (VITE_SUPABASE_URL). Login (email + password, Google OAuth) and all data
// queries run on the same project, so the login session IS the data session —
// no cross-project token exchange.
//
// (Previously this app used a two-project model: TubeProxies as a separate
// identity provider + a token exchange into this data project. That indirection
// was removed — see migration that re-instates handle_new_user provisioning on
// this project.)
//
// Renderer-only: anon key only (never service-role — RLS protects the data).

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  if (!url || !anon) return null
  if (!client) {
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // we exchange the PKCE code explicitly in AuthCallback
        flowType: 'pkce',
        storageKey: 'tg-auth'
      }
    })
  }
  return client
}

// The one client. Auth code and the data layer both use this project.
export function getSupabase(): SupabaseClient | null {
  return getClient()
}

// Back-compat: auth code historically called getTubeProxies(); it now returns
// the same single client. Kept so store/auth.ts + AuthCallback don't need a
// find-replace churn, and so any stray caller keeps working.
export function getTubeProxies(): SupabaseClient | null {
  return getClient()
}

// The data session is now the login session — nothing to establish. Kept as a
// no-op so existing call sites (App bootstrap, auth store) stay unchanged.
export async function ensureDataSession(): Promise<boolean> {
  return getClient() != null
}

// Sign-out is handled by the auth store via supabase.auth.signOut(); no
// separate data session to tear down anymore.
export async function clearDataSession(): Promise<void> {
  /* no-op — single session */
}

export const isSupabaseConfigured = (): boolean => Boolean(url && anon)

// Retained for callers that distinguished identity vs data config; with one
// project they're the same check.
export const isIdentityConfigured = (): boolean => Boolean(url && anon)
