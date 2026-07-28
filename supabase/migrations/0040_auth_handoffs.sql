-- ===================================================================
-- 0040 — Desktop OAuth handoff (tubeghost:// deep-link bridge)
-- ===================================================================
-- The Electron desktop app no longer signs in to Google inside an embedded
-- BrowserWindow (embedded webviews are increasingly blocked by Google and
-- the user can't verify the origin). Instead it opens the system browser,
-- Google redirects to the oauth-google-callback Edge Function, and the
-- resulting id_token is handed back to the desktop app over a one-time,
-- PKCE-style claim.
--
-- The desktop app ships NO Google client id or secret. Both live only in
-- this project's Edge Function secrets, so credentials rotate without a
-- new desktop release.
--
-- Flow (see docs/desktop-oauth.md for the full sequence):
--   1. desktop → POST oauth-google-start { challenge, hashed_nonce }
--      → row inserted here, { sid, auth_url } returned
--   2. browser → Google consent → GET oauth-google-callback ?code&state=sid
--      → code exchanged, id_token verified, stored on the row
--   3. browser → /auth-client?sid=… → tubeghost://auth/callback?sid=…
--   4. desktop → POST oauth-google-claim { sid, verifier }
--      → row DELETED and id_token returned (single use)
--
-- Security properties this table provides:
--   * `challenge` binds the claim to whoever started the flow. A different
--     process that observes the sid (it travels through the browser URL bar
--     and the OS deep-link handler) cannot claim without the verifier.
--   * `hashed_nonce` binds the Google id_token to this specific flow,
--     defeating token replay from another authentication.
--   * `expires_at` bounds the window to 5 minutes.
--   * RLS on with NO policies → unreachable via anon/authenticated keys.
--     Only the service-role client inside the Edge Functions can touch it.
-- ===================================================================

create table if not exists public.auth_handoffs (
  sid           text primary key,
  challenge     text not null,
  hashed_nonce  text not null,
  -- null until oauth-google-callback verifies the Google id_token. The claim
  -- query requires `id_token is not null`, so a sid cannot be claimed while
  -- the browser half of the flow is still in flight.
  id_token      text,
  platform      text,
  app_version   text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '5 minutes'
);

alter table public.auth_handoffs enable row level security;

-- No policies, by design. RLS with zero policies denies every anon and
-- authenticated request; service_role bypasses RLS entirely. Per CLAUDE.md,
-- we do NOT add `to service_role` policies — they would be dead code.

-- Supports the opportunistic expiry sweep in oauth-google-start.
create index if not exists auth_handoffs_expires_at_idx
  on public.auth_handoffs (expires_at);

-- ── Rate limiting ──────────────────────────────────────────────────
-- A per-IP fixed-window counter. Deliberately a plain table rather than a
-- new dependency (@upstash/ratelimit et al) — the volume here is one row
-- per user per sign-in, and this keeps the whole flow inside Postgres.
--
-- `bucket` is an opaque key: '<endpoint>:<ip>'. `window_start` is the
-- truncated start of the current fixed window, so a new window naturally
-- lands on a new primary key.
create table if not exists public.auth_rate_limits (
  bucket        text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 0,
  primary key (bucket, window_start)
);

alter table public.auth_rate_limits enable row level security;
-- Same as above: no policies, service-role only.

create index if not exists auth_rate_limits_window_start_idx
  on public.auth_rate_limits (window_start);

-- Atomically bump the counter for `p_bucket` in the current window and
-- report whether the caller is still under `p_limit`.
--
-- The insert-then-increment is done as a single upsert so two concurrent
-- requests can't both read a stale count and both be allowed through — the
-- returned `count` is post-increment and therefore unique per caller.
--
-- SECURITY DEFINER purely so the Edge Function could call it via RPC; it is
-- revoked from anon + authenticated (only service_role, which bypasses RLS
-- anyway, reaches it). search_path pinned per CLAUDE.md.
create or replace function public.bump_auth_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  -- Floor now() to the window boundary: to_timestamp(floor(epoch / w) * w).
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.auth_rate_limits (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
    do update set count = public.auth_rate_limits.count + 1
  returning count into v_count;

  -- Opportunistic sweep of windows that can no longer be current. Cheap:
  -- the index above makes it a range delete, and it only fires on the
  -- first request of a new window for this bucket.
  if v_count = 1 then
    delete from public.auth_rate_limits
     where window_start < now() - make_interval(secs => p_window_seconds * 4);
  end if;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.bump_auth_rate_limit(text, integer, integer)
  from public, anon, authenticated;

-- ── Expiry cleanup ─────────────────────────────────────────────────
-- Primary defence is the opportunistic delete at the top of
-- oauth-google-start (see that function). This scheduled job is the
-- belt-and-braces path so rows can't accumulate during an idle period.
--
-- pg_cron is available on Supabase but must be enabled per project; guard
-- the whole block so the migration still applies if it isn't.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    -- pg_cron ALWAYS installs into the `cron` schema regardless of any
    -- `with schema` clause, so its objects are cron.schedule / cron.job —
    -- never extensions.cron.*, which Postgres would parse as
    -- database.schema.function and reject as a cross-database reference.
    create extension if not exists pg_cron;

    -- Executed dynamically: PL/pgSQL resolves table and function names when
    -- the block is PARSED, and the `cron` schema does not exist until the
    -- create extension above has run. Static references would therefore fail
    -- to parse on a project seeing pg_cron for the first time.
    --
    -- Unschedule first so re-running the migration doesn't stack jobs.
    execute $exec$
      select cron.unschedule(jobid)
      from cron.job
      where jobname = 'auth-handoffs-cleanup'
    $exec$;

    execute format(
      'select cron.schedule(%L, %L, %L)',
      'auth-handoffs-cleanup',
      '*/10 * * * *',
      'delete from public.auth_handoffs where expires_at < now();'
      ' delete from public.auth_rate_limits where window_start < now() - interval ''1 hour'';'
    );
  end if;
exception
  -- pg_cron may be unavailable, restricted, or creatable only by a superuser
  -- depending on the project's plan. The scheduled sweep is a backstop, not
  -- the primary defence — /start deletes expired rows opportunistically on
  -- every call — so a failure here must not abort the migration.
  when insufficient_privilege or feature_not_supported then
    raise notice 'pg_cron unavailable (%); relying on opportunistic cleanup in /start', sqlerrm;
end;
$$;

notify pgrst, 'reload schema';
