# TubeProxies ⇄ TubeGhost Sync — RUNBOOK

Two Supabase projects, one identity provider, four sync guarantees.

| Role | Project | Ref |
|---|---|---|
| **TP Browser** (TubeGhost app data) | `TP Browser` | `kyolnnzjhzwjnssijhlo` |
| **TubeProxies** (identity + commerce) | `TubeProxies` | `qkntgnepntnbnqipuavv` |

TubeProxies is the **single identity provider**. TP Browser **trusts**
TubeProxies-issued JWTs via **Third-Party Auth (JWKS)** — no shared JWT
secret. Its own `auth.users` stays empty; all user FKs reference
`public.users`, a mirror kept current by the `mirror-user` webhook.

Migrations live in:
- TP Browser → `supabase/migrations/0031`–`0036`
- TubeProxies → `supabase/tubeproxies/migrations/0001`–`0002`

Edge functions live in:
- TP Browser → `supabase/functions/{auth-exchange,sync-phone-number,outbox-retry}`
- TubeProxies → `supabase/tubeproxies/functions/{mirror-user,sync-proxy-status,sync-phone-number,outbox-retry}`

All deployed `--no-verify-jwt` (they authenticate themselves: sync fns via
`x-sync-secret`, `auth-exchange` via the TubeProxies token it verifies).

---

## 1. Identity — token exchange (why NOT third-party auth)

We tried the "obvious" routes and ruled them out **empirically**:
- **Supabase Third-Party Auth** (dashboard) only trusts Firebase / Auth0 /
  Cognito / Clerk / WorkOS — there is **no "another Supabase project"
  option**. Dead end.
- **Shared JWT secret** — TubeProxies signs user sessions with **ES256**
  (asymmetric; its JWKS publishes only an ES256 key), so an HS256 shared
  secret can't verify real logins.
- **Raw token pass-through** — TP Browser's PostgREST rejects a foreign
  TubeProxies token: `401 PGRST301 "No suitable key to decode JWT"`.

So identity is bridged by a **token exchange**: the app logs in against
TubeProxies, then trades that ES256 token for a genuine **TP Browser**
session via the `auth-exchange` edge function.

**`auth-exchange`** (`supabase/functions/auth-exchange`, TP Browser,
deployed `--no-verify-jwt`):
1. Verifies the TubeProxies token against its JWKS (ES256).
2. Confirms the user is mirrored in `public.users`.
3. Ensures an `auth.users` row exists with **id == the TubeProxies sub**
   (service-role Admin API, idempotent) — so `auth.uid()` lines up with
   `public.users` and every FK.
4. Mints a real TP Browser GoTrue session (magiclink → verify) and returns
   `access_token` + `refresh_token`. Signed with TP Browser's own key, so
   PostgREST accepts it and supabase-js refreshes it normally.

No legacy JWT secret, no dashboard config. `auth.users` DOES get one row
per logged-in user (id == mirror id) — harmless, since FKs already point at
`public.users`.

Secrets it needs (TP Browser edge secrets — set in §2):
`TUBEPROXIES_ISSUER`, `TUBEPROXIES_JWKS_URL`, plus the `SELF_*` service-role
pair already set for sync. (`SUPABASE_ANON_KEY` is auto-injected.)

**Client wiring** (`src/renderer/src/lib/supabase.ts`,
`lib/token-exchange.ts`) — done:
- `getTubeProxies()` owns identity (login/signup/Google OAuth, refresh);
  its own storage key.
- `getTPBrowser()` runs its **own** exchanged GoTrue session (persist +
  auto-refresh, separate storage key).
- `ensureDataSession()` performs/refreshes the exchange; called on init and
  after each sign-in. `clearDataSession()` on sign-out.
- `getSupabase()` aliases the TP Browser (data) client for back-compat, so
  all 28 data-layer files + realtime work unchanged.

Verified end-to-end (2026-07-21): TubeProxies signup → mirror → ES256 token
→ exchange → TP Browser session (`sub == user id`) → data read under RLS +
`auth.uid()` RPC, all 200.

---

## 2. Secrets

**Never** ship service-role keys in the Electron bundle. Only anon keys
carry `VITE_` (`.env`). Service-role keys live as **edge-function secrets**.

### Shared value
- `SYNC_WEBHOOK_SECRET` — random 32+ byte hex. Both projects' webhooks
  send it as `x-sync-secret`; every sync function verifies it.
  `openssl rand -hex 32`

### On **TubeProxies** functions (peer = TP Browser)
```
supabase secrets set --project-ref qkntgnepntnbnqipuavv \
  SYNC_WEBHOOK_SECRET=<shared> \
  PEER_LABEL=tubeghost \
  PEER_SUPABASE_URL=https://kyolnnzjhzwjnssijhlo.supabase.co \
  PEER_SERVICE_ROLE_KEY=<TP Browser service_role> \
  SELF_SUPABASE_URL=https://qkntgnepntnbnqipuavv.supabase.co \
  SELF_SERVICE_ROLE_KEY=<TubeProxies service_role>
```

### On **TP Browser** functions (peer = TubeProxies)
```
supabase secrets set --project-ref kyolnnzjhzwjnssijhlo \
  SYNC_WEBHOOK_SECRET=<shared> \
  PEER_LABEL=tubeproxies \
  PEER_SUPABASE_URL=https://qkntgnepntnbnqipuavv.supabase.co \
  PEER_SERVICE_ROLE_KEY=<TubeProxies service_role> \
  SELF_SUPABASE_URL=https://kyolnnzjhzwjnssijhlo.supabase.co \
  SELF_SERVICE_ROLE_KEY=<TP Browser service_role>
```
`PEER_LABEL=tubeproxies` on TP Browser also arms the outbox isolation
backstop (proxy rows are never replayed to TubeProxies).

> **Stripe:** unchanged. The existing TubeProxies Stripe webhook (a
> Next.js route in the web-app repo) still fulfils purchases into
> `proxy_inventory` / `phone_*`. We react to those rows via database
> webhooks — we do **not** relocate or duplicate the Stripe handler, so
> there is no double-fulfilment risk. `STRIPE_WEBHOOK_SECRET` stays where
> it already is.

---

## 3. Deployment order

Apply in this order so a webhook never fires before its target exists.

1. **TP Browser migrations** (creates `users` mirror, re-points FKs, adds
   proxy/phone/outbox surface, upsert RPCs):
   ```
   supabase db push --project-ref kyolnnzjhzwjnssijhlo
   ```
   (0031→0035; hold 0036 until step 5.)
   > **Legacy users:** TP Browser already has ~8 GoTrue users that own
   > workspaces. Migration 0031 seeds `public.users` from `auth.users`
   > FIRST so the FK re-point keeps them valid. For those users to stay
   > current afterward, the same id must exist in TubeProxies `profiles`
   > (they're dev accounts — verify or recreate). New users are unaffected.
2. **TubeProxies migration 0001** (sync columns + outbox + status RPC):
   apply `supabase/tubeproxies/migrations/0001_sync_surface.sql`.
3. **Set secrets** (section 2) on both projects.
4. **Deploy functions:**
   ```
   # TubeProxies
   supabase functions deploy mirror-user sync-proxy-status sync-phone-number outbox-retry \
     --project-ref qkntgnepntnbnqipuavv
   # TP Browser
   supabase functions deploy sync-phone-number outbox-retry \
     --project-ref kyolnnzjhzwjnssijhlo
   ```
   (TP Browser function sources live under `supabase/functions/`;
   TubeProxies sources under `supabase/tubeproxies/functions/` — point the
   CLI at that dir, or copy into a `supabase/functions/` tree for that
   project.)
5. **Webhooks** (after functions exist): the webhook migrations call
   `pg_net`'s `net.http_post()` directly (they `create extension if not
   exists pg_net;` themselves), so you do **NOT** need to toggle the
   dashboard "Database Webhooks" feature — that toggle is what creates the
   `supabase_functions` schema, and its absence is the
   `schema "supabase_functions" does not exist` error.

   **Edit the two placeholders inline before applying** — do a literal
   find/replace of `:FUNCTIONS_BASE` and `:SYNC_SECRET` in the file, then
   paste into the SQL editor (or `psql -f`). The values are baked into the
   trigger function, so re-running the migration with new values updates
   them (`create or replace`). Don't rely on psql `-v`: the placeholders
   sit inside a dollar-quoted function body + single-quoted literals, where
   psql variable interpolation does not apply.
   - TubeProxies `0002_sync_webhooks.sql` → `:FUNCTIONS_BASE = https://qkntgnepntnbnqipuavv.functions.supabase.co`
   - TP Browser `0036_sync_webhooks.sql` → `:FUNCTIONS_BASE = https://kyolnnzjhzwjnssijhlo.functions.supabase.co`
6. **Mirror-user database webhook** on TubeProxies also needs to cover
   *existing* 3,249 users once (backfill):
   ```sql
   -- run in TubeProxies; re-invokes the mirror for every current user
   update public.profiles set updated_at = now();
   ```
   (Idempotent: mirror-user upserts by id; provision only on INSERT.)
7. **Schedule `outbox-retry`** on both projects (pg_cron):
   ```sql
   select cron.schedule('outbox-retry','*/2 * * * *', $$
     select net.http_post(
       url    := '<FUNCTIONS_BASE>/outbox-retry',
       headers:= '{"x-sync-secret":"<SYNC_SECRET>"}'::jsonb
     ); $$);
   ```

---

## 4. Testing the four requirements end-to-end

### Req 1 — a PURCHASE writes to BOTH projects
1. Complete a Stripe checkout for a proxy (or insert a row into
   TubeProxies `proxy_inventory` with `assigned_to = <a mirrored user>`).
2. TubeProxies row exists (master). Within seconds, TP Browser
   `proxies` has a row with `source='tubeproxies'`, `tubeproxies_id` set,
   in that user's workspace, **unassigned** to any profile.
   ```sql
   -- TP Browser
   select source, tubeproxies_id, synced_at from proxies
     where tubeproxies_id = '<inventory id>';
   ```
3. `proxy_inventory.tubeghost_synced_at` is now set (watermark).

### Req 2 — a MANUAL proxy stays TubeGhost-only
1. In TubeGhost, add a custom proxy (`source='custom'`).
2. Confirm it is **absent** from TubeProxies (`proxy_inventory`,
   `proxies`) — there is no code path that pushes it. The unit test
   `src/shared/sync/__tests__/isolation.test.ts` pins this invariant;
   the outbox backstop + the `enforce_proxy_origin_linkage` trigger
   enforce it at runtime.
3. DB-level proof (TP Browser): the trigger rejects a mislabelled row:
   ```sql
   -- must ERROR: tubeproxies_id only allowed on source='tubeproxies'
   update proxies set tubeproxies_id = gen_random_uuid()
     where source = 'custom' limit 1;
   ```

### Req 3 — phone numbers identical + status changes propagate
1. Provision a number in TubeProxies (`phone_numbers` insert). It appears
   in TP Browser `phone_numbers` with the **same `id`**.
2. Release/expire it in TubeProxies (status change). TP Browser reflects
   the new status within seconds (`sync_source='tubeproxies'`).
3. Reverse direction (defensive): update status in TP Browser via
   service_role with `sync_source='tubeghost'`; TubeProxies reflects it,
   and neither side bounces (content-hash + sync_source echo guard).

### Req 4 — auth comes from TubeProxies
1. Sign in / sign up in TubeGhost → hits **TubeProxies** auth. Google
   OAuth opens the popup and completes against TubeProxies.
2. A brand-new user gets a TP Browser workspace within seconds
   (mirror-user → `provision_mirrored_user`).
3. `select id, email from users` in TP Browser shows the TubeProxies
   identity; `auth.users` in TP Browser stays empty.

---

## 5. Failure modes & idempotency

- **Webhook retries / races** — all peer writes go through upserts keyed
  on the shared id (`sync_upsert_purchased_proxy`, `sync_upsert_phone_number`,
  `users` PK), so replays are no-ops.
- **Mirror not ready** (proxy/phone arrives before the user is mirrored)
  — the RPC raises `P0001`; the function enqueues to `sync_outbox`;
  `outbox-retry` drains it after the mirror lands.
- **Loop prevention** — shared UUID PK + `sync_source` + content guard in
  the phone RPCs; the outbound webhook skips rows it recognises as echoes.
- **Peer down** — failed writes land in `sync_outbox` with exponential
  backoff (30s→2h), capped at `max_attempts=10`, then marked resolved
  with the last error for inspection.
- **Isolation backstop** — on TP Browser, `outbox-retry` refuses to
  replay any `proxy` entity toward TubeProxies (`PEER_LABEL=tubeproxies`).
