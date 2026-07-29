-- ===================================================================
-- 0041 — MCP device relay (Claude Bridge)
-- ===================================================================
-- Backs the remote MCP server that lets Claude drive the local TubeGhost
-- desktop app. Three durable tables:
--
--   devices       — one row per paired machine (desktop, laptop). Holds the
--                   HASHED agent + refresh tokens (never plaintext). Presence
--                   (online/offline) is NOT stored here — it lives in Redis
--                   (presence:{deviceId}, TTL 45s). last_seen_at is a durable
--                   mirror so the dashboard shows "last seen" after Redis TTL.
--   pairing_codes — short-lived (10 min) one-time codes the desktop app trades
--                   for a device token. 8 chars Crockford base32.
--   command_log   — durable audit of every relayed command. args are REDACTED
--                   before insert (no proxy creds / cookies / tokens).
--
-- Isolation: every table is user-scoped via user_id. RLS lets a user read/
-- manage ONLY their own rows. The relay + agent endpoints run as service_role
-- (Vercel functions) and enforce ownership in code before every enqueue, so a
-- command can never cross a user boundary. Per CLAUDE.md we add NO
-- `to service_role` policies.
--
-- Pre-flight checklist (CLAUDE.md): RLS on every table ✓, (select auth.uid())
-- in policies ✓, no USING(true) ✓, no service_role policies ✓, search_path=''
-- on the SECURITY DEFINER fn ✓, supporting indexes ✓, notify pgrst ✓.
-- ===================================================================

-- ── devices ────────────────────────────────────────────────────────
create table if not exists public.devices (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  platform           text,
  app_version        text,
  -- sha256(token) hex. The plaintext token is returned to the desktop app ONCE
  -- at pair/refresh time and never stored. Agent endpoints look the device up
  -- by hashing the presented Bearer token.
  token_hash         text,
  refresh_token_hash text,
  created_at         timestamptz not null default now(),
  -- Durable "last seen" mirror of the Redis presence key; refreshed on every
  -- poll/heartbeat so the dashboard can show it after the 45s Redis TTL lapses.
  last_seen_at       timestamptz,
  -- Set when the user revokes the device. A revoked device's tokens are dead
  -- even before Redis TTLs expire; the agent endpoints check this.
  revoked_at         timestamptz,
  -- Per-device "allow write actions from Claude" toggle. Read tools ignore it;
  -- write/action/destructive tools require it true. Default: reads allowed,
  -- writes allowed but delete still needs confirm (enforced in the relay).
  write_enabled      boolean not null default true
);

alter table public.devices enable row level security;

-- Token lookups are by hash from the service-role agent endpoints (RLS
-- bypassed there), but index them anyway for the login-time lookup path.
create index if not exists devices_user_id_idx on public.devices (user_id);
create unique index if not exists devices_token_hash_idx
  on public.devices (token_hash) where token_hash is not null;
create unique index if not exists devices_refresh_token_hash_idx
  on public.devices (refresh_token_hash) where refresh_token_hash is not null;

-- Owner may read + manage their own devices from the dashboard (anon key +
-- these policies). Insert happens server-side via service_role (pairing), so
-- there is deliberately no INSERT policy for authenticated users.
drop policy if exists "devices.select own" on public.devices;
create policy "devices.select own" on public.devices for select
  using (user_id = (select auth.uid()));

-- Rename + toggle write_enabled from the dashboard. Cannot change ownership or
-- token hashes: those columns are managed only by the service-role endpoints.
drop policy if exists "devices.update own" on public.devices;
create policy "devices.update own" on public.devices for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "devices.delete own" on public.devices;
create policy "devices.delete own" on public.devices for delete
  using (user_id = (select auth.uid()));

-- ── pairing_codes ──────────────────────────────────────────────────
create table if not exists public.pairing_codes (
  code        text primary key,          -- 8 chars, Crockford base32, uppercase
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '10 minutes',
  -- Set the moment the desktop app redeems it; a consumed code is dead.
  consumed_at timestamptz
);

alter table public.pairing_codes enable row level security;

create index if not exists pairing_codes_user_id_idx on public.pairing_codes (user_id);
create index if not exists pairing_codes_expires_at_idx on public.pairing_codes (expires_at);

-- The user may read their own outstanding codes (to display / regenerate).
-- Creation + consumption are service-role only, so no insert/update policies.
drop policy if exists "pairing_codes.select own" on public.pairing_codes;
create policy "pairing_codes.select own" on public.pairing_codes for select
  using (user_id = (select auth.uid()));

-- ── command_log ────────────────────────────────────────────────────
create table if not exists public.command_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- Device the command targeted. SET NULL so the audit row survives device
  -- deletion (mirrors activity_log.user_id reasoning in CLAUDE.md).
  device_id     uuid references public.devices (id) on delete set null,
  tool          text not null,
  -- Redacted, JSON-serialisable args. The relay strips every secret-bearing
  -- field (proxy creds, cookies, tokens) BEFORE insert. Never raw args.
  args_redacted jsonb not null default '{}'::jsonb,
  status        text not null default 'queued',   -- queued|running|succeeded|failed
  error_code    text,
  duration_ms   integer,
  source        text not null default 'mcp',      -- 'mcp' (Claude) vs future sources
  created_at    timestamptz not null default now()
);

alter table public.command_log enable row level security;

create index if not exists command_log_user_id_created_idx
  on public.command_log (user_id, created_at desc);
create index if not exists command_log_device_id_idx on public.command_log (device_id);

-- The user may read their own audit trail (dashboard shows the last 50).
-- Writes are service-role only from the relay.
drop policy if exists "command_log.select own" on public.command_log;
create policy "command_log.select own" on public.command_log for select
  using (user_id = (select auth.uid()));

-- ── Pairing-code generation helper ─────────────────────────────────
-- Called by the service-role /api/devices/pairing-code endpoint (which has
-- already verified the Supabase session and resolved p_user_id). SECURITY
-- DEFINER + revoked from anon/authenticated: only reachable via service_role,
-- which bypasses RLS anyway, but we keep it locked per CLAUDE.md.
--
-- Generates a unique 8-char Crockford base32 code (no I L O U — the ambiguous
-- letters), inserts it, and returns { code, expires_at }. Retries on the
-- astronomically unlikely PK collision.
create or replace function public.mint_pairing_code(p_user_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  -- Crockford base32
  v_code     text;
  v_expires  timestamptz;
  i          integer;
  attempt    integer := 0;
begin
  loop
    attempt := attempt + 1;
    v_code := '';
    for i in 1..8 loop
      -- floor(random()*32) → 0..31 index into the 32-char alphabet.
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;

    begin
      insert into public.pairing_codes (code, user_id)
      values (v_code, p_user_id)
      returning public.pairing_codes.expires_at into v_expires;
      exit;  -- inserted cleanly
    exception when unique_violation then
      if attempt >= 5 then
        raise exception 'could not mint unique pairing code after % attempts', attempt;
      end if;
      -- else loop and try another code
    end;
  end loop;

  -- Opportunistic cleanup of stale codes for this user (keeps the table small
  -- without relying on pg_cron). Qualify expires_at with the table name — the
  -- RETURNS TABLE OUT parameter is also named expires_at, so a bare reference is
  -- ambiguous (error 42702).
  delete from public.pairing_codes
   where public.pairing_codes.user_id = p_user_id
     and public.pairing_codes.expires_at < now();

  code := v_code;
  expires_at := v_expires;
  return next;
end;
$$;

revoke all on function public.mint_pairing_code(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
