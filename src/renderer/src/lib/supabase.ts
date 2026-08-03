import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The client is created with `db: { schema: 'ghost' }`, which supabase-js
// encodes in the TYPE, not just at runtime. A bare `SupabaseClient` defaults
// its schema parameter to "public" and therefore will not accept it — hence
// this alias. Every consumer that holds the client must use GhostClient.
export type GhostClient = SupabaseClient<any, any, 'ghost', any, any> // eslint-disable-line @typescript-eslint/no-explicit-any

// ── Single-client setup ────────────────────────────────────────────
// This app authenticates DIRECTLY against its own Supabase project
// (VITE_SUPABASE_URL). Login (email + password, Google OAuth) and all data
// queries run on the same project, so the login session IS the data session —
// no cross-project token exchange.
//
// Since the TubeGhost → TubeProxies DB consolidation that project is the
// SHARED one (qkntgnepntnbnqipuavv). TubeGhost's tables were moved into a
// `ghost` schema there; TubeProxies keeps `public`.
//
// Renderer-only: anon key only (never service-role — RLS protects the data).

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let client: GhostClient | null = null

function getClient(): GhostClient | null {
  if (!url || !anon) return null
  if (!client) {
    client = createClient(url, anon, {
      // ── Schema: ghost ────────────────────────────────────────────
      // Every TubeGhost table lives in the `ghost` schema of the shared
      // TubeProxies project. This default makes all .from() calls resolve
      // there without per-call qualification.
      //
      // A global default (rather than .schema('ghost') at each call site)
      // is correct here because EVERY renderer .from() reads a ghost-owned
      // table. The failure mode also matters: a missed .schema() would
      // silently read TubeProxies' live customer tables, whereas a missing
      // ghost table errors loudly.
      //
      // To read a TubeProxies table (public), use getPublicSchema() below.
      //
      // NOTE: `ghost` must be added to Exposed Schemas in the Supabase
      // dashboard or PostgREST refuses to serve it at all.
      db: { schema: 'ghost' },
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
export function getSupabase(): GhostClient | null {
  return getClient()
}

// Back-compat: auth code historically called getTubeProxies(); it now returns
// the same single client. Kept so store/auth.ts + AuthCallback don't need a
// find-replace churn, and so any stray caller keeps working.
export function getTubeProxies(): GhostClient | null {
  return getClient()
}

// ── TubeProxies-owned tables (public schema) ───────────────────────
// The client defaults to `ghost`, so reading a TubeProxies table needs an
// explicit hop. Use this rather than .schema('public') inline, so every
// cross-boundary read is greppable in one place.
//
// TubeProxies owns these and TubeGhost is READ-ONLY against them:
//   profiles         user accounts (NOT browser profiles — see below)
//   phone_numbers    purchased numbers   phone_sms   received messages
//   proxies          purchase assignments
//   proxy_inventory  the actual proxy endpoints
//   teams / team_members / subscriptions
//
// ⚠ public.profiles is TubeProxies' USER ACCOUNTS table. TubeGhost's
// browser fingerprint profiles are ghost.browser_profiles. They are
// unrelated; the rename exists precisely so this cannot be confused.
export function getPublicSchema(): ReturnType<GhostClient['schema']> | null {
  const c = getClient()
  return c ? c.schema('public') : null
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
