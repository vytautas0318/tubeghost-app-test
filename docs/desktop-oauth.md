# Desktop OAuth handoff

How the TubeGhost **desktop app** signs a user in with Google, using this web
app + its Vercel serverless functions as the OAuth bridge — the role
`app-global.adspower.net` plays for AdsPower.

Replaces the old flow, where the desktop app opened an embedded
`BrowserWindow` pointed at the Supabase auth URL. Embedded webviews are
increasingly blocked by Google, and the user cannot verify the origin of a
sign-in form rendered inside another app's window.

## Design constraints

- **The desktop app ships no Google credentials.** The client id and secret
  live only in Vercel project env vars, so they rotate without a new desktop
  release.
- **The `sid` travels through untrusted places** — the browser URL bar, the
  OS deep-link handler. It is therefore useless on its own: redeeming it
  requires the `verifier`, which never leaves the desktop app.
- **Single use.** The row is deleted in the same statement that reads it.

## Sequence

```
 Desktop app          Vercel /api routes         Google          Browser
     │                        │                     │               │
     │ 1. POST /start         │                     │               │
     │   {challenge,          │                     │               │
     │    hashed_nonce}       │                     │               │
     ├───────────────────────►│                     │               │
     │                        │ insert auth_handoffs│               │
     │◄───────────────────────┤                     │               │
     │   {sid, auth_url}      │                     │               │
     │                        │                     │               │
     │ 2. open system browser at auth_url           │               │
     ├──────────────────────────────────────────────────────────────►
     │                        │                     │  consent      │
     │                        │                     │◄──────────────┤
     │                        │                     │               │
     │                        │ 3. GET /callback    │               │
     │                        │    ?code&state=sid  │               │
     │                        │◄────────────────────────────────────┤
     │                        │ exchange code ─────►│               │
     │                        │◄──────── id_token   │               │
     │                        │ verify aud/iss/exp/nonce            │
     │                        │ store id_token on row               │
     │                        │ 302 → /auth-client?sid=…            │
     │                        ├────────────────────────────────────►│
     │                        │                     │               │
     │ 4. tubeghost://auth/callback?sid=…           │               │
     │◄─────────────────────────────────────────────────────────────┤
     │                        │                     │               │
     │ 5. POST /claim         │                     │               │
     │   {sid, verifier}      │                     │               │
     ├───────────────────────►│ DELETE … RETURNING  │               │
     │◄───────────────────────┤ compare challenge   │               │
     │   {id_token}           │                     │               │
     │                        │                     │               │
     │ 6. supabase.auth.signInWithIdToken({provider:'google', token})│
```

Step 6 runs against this project's own Supabase GoTrue — the app
authenticates directly against `VITE_SUPABASE_URL` (the earlier two-project
TubeProxies identity model was removed), so the id_token becomes a normal
session with no exchange step.

## Endpoints

All three are Vercel serverless functions under `api/oauth/google/`. All run
while the user is still signed out, so none of them expect an Authorization header.

Base URL: `https://app.tubeghost.com`

### `POST /api/oauth/google/start`

```jsonc
// request
{ "challenge": "<base64url(sha256(verifier))>",
  "hashed_nonce": "<base64url(sha256(raw_nonce))>",
  "client": { "platform": "darwin|win32", "version": "1.2.3" } }

// 200
{ "sid": "<base64url, 16 random bytes>",
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

`challenge` and `hashed_nonce` must both be exactly 43 base64url chars
(a SHA-256 digest); anything else is a 400. `client` is telemetry only and is
never used for an auth decision.

Google URL parameters: `client_id`, `redirect_uri` (= `OAUTH_REDIRECT_URI`),
`response_type=code`, `scope=openid email profile`, `state=<sid>`,
`nonce=<hashed_nonce>`, `access_type=online`, `prompt=select_account`.

The `nonce` sent to Google is the **hashed** nonce. Google echoes it into the
id_token, and `/callback` compares it to the stored value — that binding is
what stops an id_token from another flow being replayed into this one. The raw
nonce never leaves the desktop app.

### `GET /api/oauth/google/callback?code&state`

The value registered with Google as an authorized redirect URI. Always
responds `302` — the client here is a browser, not a JSON consumer.

Verifies the id_token's `aud` (== our client id), `iss` (`accounts.google.com`
or `https://accounts.google.com`), `exp` (in the future), and `nonce` (==
stored `hashed_nonce`). Signature verification is deliberately skipped: the
token is read from Google's token endpoint over TLS in response to a request
carrying our client secret, so that channel authenticates it. The four claim
checks are what bind it to *this client* and *this flow*.

On success → `/auth-client?sid=…`. On failure → `/auth-client?sid=…&error=…`.

### `GET /auth-client` (web app route, not a function)

[src/renderer/src/pages/AuthClient.tsx](../src/renderer/src/pages/AuthClient.tsx).
Fires `location.replace('tubeghost://auth/callback?sid=…')` immediately,
offers a plain `<a>` to the same URL for browsers that suppress scripted
custom-scheme navigation, attempts `window.close()` after 2s, and reveals a
download link after 4s in case the app isn't installed. Dark theme, no app
chrome, `noindex`.

Handled before every auth and workspace gate in `App.tsx`, so it renders
identically whether or not the visitor has a web session.

### `POST /api/oauth/google/claim`

```jsonc
// request
{ "sid": "...", "verifier": "<the raw verifier>" }

// 200
{ "id_token": "eyJ..." }

// 4xx
{ "error": "invalid_sid|expired|already_claimed|invalid_verifier|invalid_state|rate_limited" }
```

Called **server-to-server from Electron's main process**, not from a browser.

Single use is enforced by consuming the row and reading it in one statement:

```sql
delete from auth_handoffs
 where sid = $1 and expires_at > now() and id_token is not null
 returning id_token, challenge;
```

`id_token is not null` means a flow whose browser half is still in flight is
never consumed — that case returns `invalid_state` (409) and the desktop app
should keep waiting.

The verifier is compared **after** the delete, constant-time. A wrong verifier
therefore also burns the sid: a guessed sid gets exactly one attempt. This is
intended.

`already_claimed` and "sid never existed" are deliberately indistinguishable —
the row is gone in both cases.

## Error codes

Shared verbatim with the desktop app.

| Code | Meaning | Where raised |
|---|---|---|
| `access_denied` | User cancelled at the Google consent screen | `/callback` |
| `invalid_state` | Unknown/expired `state`, or claim before the browser half finished | `/callback`, `/claim` |
| `exchange_failed` | Code exchange failed, or an id_token claim check failed | `/callback` |
| `expired` | Handoff older than 5 minutes | `/claim` |
| `already_claimed` | Row consumed by a previous claim, or never existed | `/claim` |
| `invalid_verifier` | Verifier does not derive to the stored challenge | `/claim` |
| `rate_limited` | Per-IP limit exceeded | `/start`, `/claim` |
| `server_error` | Misconfiguration or unexpected failure | any |

## Storage

`public.auth_handoffs` — migration
[0040_auth_handoffs.sql](../supabase/migrations/0040_auth_handoffs.sql).

RLS enabled with **zero policies**, so it is unreachable via the anon or
authenticated keys; only the service-role client inside the serverless functions can
touch it. Per `CLAUDE.md` we do not add `to service_role` policies — they
would be dead code, since service_role bypasses RLS entirely.

Rows expire after 5 minutes. Cleanup runs two ways: an opportunistic
`delete … where expires_at < now()` at the top of `/start`, and a `pg_cron`
job every 10 minutes (guarded — the migration still applies if `pg_cron`
isn't available on the project).

Rate limiting uses `public.auth_rate_limits`, a per-IP fixed-window counter
bumped through `bump_auth_rate_limit(bucket, limit, window_seconds)`. The
upsert returns a post-increment count, so concurrent requests can't both read
a stale value. It **fails open** — a broken counter must not lock everyone out
of sign-in. Limits: `/start` 10 per IP per 5 min, `/claim` 20 per IP per 5 min.

## Configuration

Vercel project env vars (Settings → Environment Variables, or
`vercel env add NAME production`). The repo-root `.env` holds the same values
for `vercel dev`, and is gitignored.

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth **Web application** client id |
| `GOOGLE_CLIENT_SECRET` | its secret |
| `OAUTH_REDIRECT_URI` | `https://app.tubeghost.com/api/oauth/google/callback` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key for that project |

None carry a `VITE_` prefix, so none are bundled into the renderer. The `api/`
directory also sits outside Vite's `root` (`src/renderer/`), so the client
build cannot resolve these modules even by mistake — two independent
guarantees.

In the Google Cloud console the client must be type **Web application** (not
Desktop — there is no local redirect here), with `OAUTH_REDIRECT_URI` listed
verbatim as an authorized redirect URI. Google string-matches it exactly; a
trailing slash or an `http`/`https` mismatch produces `redirect_uri_mismatch`
at consent time.

Verify no secret reaches the bundle after a build:

```bash
npm run build
grep -ril "GOOGLE_CLIENT_SECRET\|service_role\|auth_handoffs" dist/   # → no matches
```

Deploy: the functions ship with the normal Vercel deploy of this repo — the
`api/` directory is picked up automatically. Note that `vercel.json`'s SPA
rewrite excludes `/api/`, otherwise every function call would be rewritten to
`index.html`.

`npm run typecheck` covers both the SPA and `api/` (separate tsconfigs, since
the functions target Node and the SPA targets the browser).

## Replaying a flow manually

```bash
BASE=https://app.tubeghost.com/api/oauth/google

# 1. Generate a verifier and its challenge, plus a nonce and its hash.
VERIFIER=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -sha256 -binary \
            | openssl base64 | tr '+/' '-_' | tr -d '=')
NONCE=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
HASHED_NONCE=$(printf '%s' "$NONCE" | openssl dgst -sha256 -binary \
            | openssl base64 | tr '+/' '-_' | tr -d '=')

# 2. Start the flow.
curl -s -X POST "$BASE/start" \
  -H 'Content-Type: application/json' \
  -d "{\"challenge\":\"$CHALLENGE\",\"hashed_nonce\":\"$HASHED_NONCE\",
       \"client\":{\"platform\":\"darwin\",\"version\":\"0.0.0-dev\"}}"
# → {"sid":"…","auth_url":"https://accounts.google.com/…"}

# 3. Open auth_url in a browser. The consent screen must read
#    "to continue to TubeGhost". Complete it; you land on /auth-client
#    and the browser offers to open TubeGhost.

# 4. Claim, using the sid from step 2 (within 5 minutes).
SID=<sid from step 2>
curl -s -X POST "$BASE/claim" \
  -H 'Content-Type: application/json' \
  -d "{\"sid\":\"$SID\",\"verifier\":\"$VERIFIER\"}"
# → {"id_token":"eyJ…"}

# 5. Claim again — single use.
curl -s -X POST "$BASE/claim" \
  -H 'Content-Type: application/json' \
  -d "{\"sid\":\"$SID\",\"verifier\":\"$VERIFIER\"}"
# → {"error":"already_claimed"}
```

Never paste a real `id_token` or `verifier` into a bug report or log — they
are credentials.

## Tests

[src/shared/oauth-handoff.test.ts](../src/shared/oauth-handoff.test.ts) —
`npx vitest run src/shared/oauth-handoff.test.ts`.

Covers expired handoff, wrong verifier, double claim, unknown sid, nonce
mismatch, foreign issuer, wrong audience, expired id_token, and the Google URL
parameter set. The decision logic lives in
[src/shared/oauth-handoff.ts](../src/shared/oauth-handoff.ts) so vitest can
reach it; the serverless functions keep the I/O half in
[api/_lib/handoff.ts](../api/_lib/handoff.ts).
