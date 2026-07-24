# TubeProxies Dashboard ↔ TubeProxies Browser — Integration Plan

This document is for the **TubeProxies dashboard** team. It specifies
what the desktop browser app needs from the dashboard's API + auth
surfaces in order to connect a workspace to its proxy inventory.

The browser repo is at `~/Documents/GitHub/TubeProxies Browser`. The
relevant context here is in [PLAN.md](PLAN.md) §6.6 (TubeProxies tab),
[CLAUDE.md](CLAUDE.md) (architecture), and the v1 settings UI in
[src/renderer/src/pages/settings/TubeproxiesTab.tsx](src/renderer/src/pages/settings/TubeproxiesTab.tsx).

## TL;DR

Replace the API-key-paste UX with **OAuth 2.0 PKCE** so a logged-in
TubeProxies user can connect their browser workspace in two clicks.
Expose four endpoints (`inventory`, `assign`, `release`, `account`)
plus an optional webhook for inventory updates.

If the dashboard and the browser share a Supabase project, the OAuth
piece collapses into a single shared-session check — no OAuth dance
needed. **Confirm this first.** It changes the work by a factor of 5.

---

## 1. Auth — pick one of two paths

### Path A — Shared Supabase project (preferred if applicable)

If the dashboard and the browser are **on the same Supabase project**:

- The browser already has the user's session (they sign in with their
  TubeProxies email/password the same way they sign in to the
  dashboard).
- The dashboard's `proxies` table can be read directly by the browser
  via PostgREST, gated by the dashboard's existing RLS — no new API
  surface needed.
- Workspace-membership equivalence is the only thing to wire: a
  TubeProxies dashboard "account" maps to a Browser "workspace." We
  need a stable mapping (one dashboard account = one browser workspace
  with the same `id`, or a join table).

**Effort**: ~1 day on the dashboard side (RLS read policy for browser
clients, possibly a `dashboard_account_id` column on `workspaces`).
~1 day on the browser side (a `lib/tubeproxies-api.ts` that just queries
the shared tables instead of calling REST).

### Path B — Separate Supabase projects (or the dashboard isn't on Supabase)

If the products are on **separate auth surfaces** — different Supabase
projects, or the dashboard uses a completely different stack — then we
need real OAuth.

**OAuth 2.0 with PKCE** (the spec for native apps without a server-side
client secret):

1. Browser opens an Electron popup at
   `https://dashboard.tubeproxies.com/oauth/authorize` with:
   - `client_id=tubeproxies_browser_app`
   - `redirect_uri=tubeproxies-browser://oauth-callback`
   - `response_type=code`
   - `scope=proxies:read proxies:assign account:read`
   - `code_challenge=<sha256>` + `code_challenge_method=S256`
   - `state=<csrf-nonce>`
2. User authorises (or signs in first if not already).
3. Dashboard redirects to the deep link with `?code=…&state=…`.
4. Browser exchanges the code at `POST /oauth/token` with the original
   `code_verifier` and gets `{ access_token, refresh_token, expires_in }`.
5. Browser stores the **refresh token** encrypted in
   `workspaces.tubeproxies_refresh_token_encrypted`. Access tokens are
   short-lived (1 hour) and never persisted.

**Effort**: ~2-3 days on the dashboard side (OAuth endpoints,
authorisation page, scope enforcement, token storage). ~2 days on the
browser side (OAuth client + token refresh + IPC handler for the deep
link).

**My recommendation**: Path A if at all possible. OAuth is the right
solution for partner integrations, but not for first-party where you
control both ends and they share auth infrastructure. We'd just be
shipping ceremony.

---

## 2. Required API surface

These are the same regardless of auth path. With Path A they're
PostgREST queries; with Path B they're REST endpoints.

### `GET /api/v1/proxies/inventory`

List every proxy the authenticated user has access to.

```json
{
  "proxies": [
    {
      "id": "uuid",
      "type": "residential" | "datacenter" | "mobile",
      "host": "1.2.3.4",
      "port": 8080,
      "username": "user_xxx",
      "password_token": "tok_xxx",
      "country": "US",
      "city": "New York",
      "state": "NY",
      "subnet_24": "1.2.3.0/24",
      "asn": "AS12345",
      "isp": "Comcast",
      "status": "active" | "inactive" | "rotating",
      "expires_at": "2026-12-31T00:00:00Z",
      "assigned_to_external_id": null
    }
  ],
  "total": 1234,
  "next_cursor": null
}
```

**Pagination**: cursor-based, default page size 100.
**Caching**: client may cache for 5 min; we'll re-fetch on Sync click.
**Rate limit**: 60 req/min/user is generous.

### `POST /api/v1/proxies/{id}/assign`

Mark a proxy as exclusively assigned to a browser profile. The
dashboard tracks this so the inventory page shows "in use by
TubeProxies Browser → Profile #42" and the browser respects the C-class
subnet rule (no two profiles share /24).

```json
{
  "external_id": "browser-profile-uuid",
  "external_label": "Profile #42 (workspace: Acme)"
}
```

Response: `{ "ok": true }` or `{ "ok": false, "reason": "already_assigned" }`.

### `POST /api/v1/proxies/{id}/release`

Inverse of assign. Called when the browser deletes a profile or
manually releases the proxy.

```json
{ "external_id": "browser-profile-uuid" }
```

### `GET /api/v1/account`

Used by the browser to render a "Connected as Julian @ Acme Co" status
in Settings → TubeProxies. Minimal payload:

```json
{
  "user_id": "uuid",
  "email": "user@example.com",
  "display_name": "Julian Petersen",
  "avatar_url": "https://...",
  "plan": "starter" | "pro" | "scale",
  "proxy_quota": 100,
  "proxies_used": 47
}
```

This also drives the **plan-limit hint** in the browser's profile
creator: if `proxies_used >= proxy_quota`, the proxy picker shows an
upgrade banner.

---

## 3. Optional but valuable: inventory webhook

When a proxy is added, removed, or rotates IPs on the dashboard side,
the browser should know without polling.

Two options:

### Option 1 — Webhook to a customer endpoint

Each connected browser workspace registers a webhook URL. **Doesn't
work for desktop apps** — they don't have a public URL.

### Option 2 — Realtime subscription via Supabase

If Path A (shared Supabase), the browser can `supabase.channel()`
listen to `proxies` table changes filtered by the user's account. Free,
real-time, and matches the architecture we already use for
[postgres_changes subscriptions](src/renderer/src/pages/proxies/useProxiesData.ts).

If Path B (separate Supabase), the dashboard could expose a
**Server-Sent Events** endpoint at `/api/v1/proxies/stream` keyed on
the access token. Less elegant but works.

**Recommendation**: ship without the webhook in v1, add SSE in v1.1 if
users complain about staleness. Most users hit Sync once per session
and that's fine.

---

## 4. Scopes and security

OAuth scopes the browser will request:

| Scope | Justification |
|---|---|
| `proxies:read` | List inventory, view proxy metadata |
| `proxies:assign` | Reserve a proxy to a browser profile |
| `proxies:release` | Free a proxy when a profile is deleted |
| `account:read` | Show "Connected as X" + plan-limit awareness |

The browser will **never** request:

- `proxies:create` / `proxies:delete` — not the browser's job
- `billing:*` — billing flows live on the dashboard
- `account:write` — no account-mutation flows

Refresh tokens stored on the browser side will be:

- Encrypted at rest in `workspaces.tubeproxies_refresh_token_encrypted`
  (column already exists, currently used by the API-key flow — same
  storage with a new format).
- **Never** written to logs or sent to telemetry.
- Revocable from the dashboard side (`POST /oauth/revoke`) if the user
  signs the desktop app out.

---

## 5. Plan-feature gating considerations

The browser already tracks workspace plans in its own `plans` /
`plan_features` tables. The dashboard's plan tier should override this
when set — i.e. if the dashboard says the user has "scale" plan but the
browser workspace says "free", the browser should enable scale-tier
features (bulk, custom roles, etc.) for the duration of the connected
session.

**Open question**: do we treat the dashboard plan as authoritative, or
does the browser have its own billing relationship? If they share
billing — recommended — the browser's `BillingTab.tsx` should deep-link
to the dashboard's billing portal and the browser's local `plan`
column becomes a cache of the dashboard's value (with a webhook to
keep it fresh).

---

## 6. Phasing recommendation for the dashboard team

Don't ship this all at once. Three milestones:

### Milestone 1 — Inventory read-only (1-2 weeks)

- `GET /inventory`
- `GET /account`
- API key auth (re-use the existing key flow if any)
- Browser side: replace the "Sync TubeProxies" stub with a real HTTP
  client.

This unblocks the **biggest user-visible improvement**: the browser
can show real proxy inventory immediately. Even without OAuth, even
without assign/release, the experience jumps from "nothing" to "I can
see my proxies."

### Milestone 2 — Assign / release + OAuth (2 weeks)

- `POST /assign` + `POST /release`
- OAuth 2.0 PKCE with the four scopes
- Replace API-key UI with the OAuth flow
- Enforce subnet rules across browser-assigned proxies

### Milestone 3 — Realtime + plan sync (1-2 weeks)

- Supabase subscription or SSE stream
- Plan-tier mirror via webhook
- Surface "in use by Browser" state on the dashboard's proxy list

---

## 7. What the browser team commits to in return

So this isn't a one-way ask. From our side:

- Honour `proxies:read` cache hints (no thundering-herd polling).
- Respect `assigned_to_external_id` — don't try to assign a proxy
  another product owns.
- Show clear UX when an OAuth scope is missing or revoked.
- Ship a "Disconnect TubeProxies" button in Settings that calls
  `/oauth/revoke` and wipes our local refresh token.
- Display the dashboard's plan limits faithfully (no shadow upgrades).
- Send a stable `User-Agent: TubeProxiesBrowser/<version> (<platform>)`
  so the dashboard can rate-limit / analytics us correctly.

---

## 8. Open questions for the dashboard team

1. **Same Supabase project, yes/no?** This is the biggest single
   decision. Path A vs. Path B differ by ~2 weeks of work and ongoing
   maintenance.
2. **Existing API key flow** — does one already exist for partners?
   If so, we can use that for Milestone 1 and only add OAuth at
   Milestone 2.
3. **Subnet rule** — does the dashboard already enforce "no two
   profiles share a /24" or do we enforce it on the browser side?
   Both is fine; just avoid neither.
4. **Plan billing** — single billing relationship (dashboard owns it,
   browser mirrors) or separate? Strongly prefer single.
5. **Refresh token rotation** — do you want browser refresh tokens to
   rotate on use (more secure) or be long-lived (simpler)?
   Recommendation: rotation, with a 30-day inactivity expiry.
6. **CDN for assign/release writes** — these are low-frequency. Don't
   need a CDN. Direct Postgres writes through PostgREST are fine.

---

## 9. What this enables once shipped

- **One-click connect** instead of paste-an-API-key.
- **Live inventory** in the proxy picker dropdown (per-profile).
- **Auto-coherence**: when a US proxy is selected, set timezone +
  language + geo on the profile to match. Already wired on the browser
  side; just needs the proxy metadata.
- **Plan limits surface**: profile creator shows "47 / 100 proxies
  used" with an upgrade hint when capped.
- **Assign visibility**: the dashboard shows "Profile #42 in
  TubeProxies Browser is using this proxy" so the user understands
  cross-product state.
- **Foundation for the analytics/MCP idea** in [idea.md](idea.md) —
  every analytics flow starts with "look up which channels live behind
  which proxies," which requires a clean handle on the proxy ↔ profile
  mapping.

---

## 10. Next step

Have someone on the dashboard team read this. Confirm answers to the
six open questions in §8. Then we scope Milestone 1 and pick a
target date.

Browser side is ready when you are — we already have:

- The Settings → TubeProxies tab UX.
- The Proxies page reading from a local table.
- Proxy precheck + egress-IP verification working today.
- The schema column for storing whatever credential the auth path
  produces (API key OR OAuth refresh token).

We just don't have anywhere to fetch from. That's all you.
