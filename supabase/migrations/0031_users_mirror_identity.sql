-- ===================================================================
-- 0031 — TubeProxies identity mirror (JWKS Third-Party Auth)
-- ===================================================================
-- TubeProxies (project qkntgnepntnbnqipuavv) is the single identity
-- provider. TP Browser trusts TubeProxies-issued JWTs via Supabase
-- Third-Party Auth (JWKS) — see RUNBOOK.md "Identity". Consequence:
-- TP Browser's own auth.users is NEVER populated by GoTrue for these
-- users; auth.uid() returns the TubeProxies user id (= profiles.id in
-- TubeProxies = the `sub` claim). Every FK that today points at
-- auth.users would therefore fail on insert.
--
-- Fix (per the agreed architecture):
--   1. Create public.users — a mirror of TubeProxies profiles, kept in
--      sync by the mirror-user edge function (DB webhook on TubeProxies
--      auth.users / profiles insert+update).
--   2. Re-point EVERY public FK that references auth.users so it
--      references public.users instead. Done generically via catalog
--      lookup so we don't depend on auto-generated constraint names and
--      so it stays re-runnable.
--   3. Replace handle_new_user()'s auth.users trigger with an RPC
--      (provision_mirrored_user) the edge function calls — first-time
--      users still get a workspace + owner membership + seeded roles.
--
-- Idempotent + re-runnable. No data loss: auth.users is already empty in
-- this project, so re-pointing FKs cannot orphan existing rows.
-- ===================================================================

-- ── 1. users mirror table ──────────────────────────────────────────
-- id equals TubeProxies profiles.id (= auth.users.id in TubeProxies =
-- the JWT `sub`). role stored as text (TubeProxies uses an enum
-- public.user_role we intentionally do NOT couple to).
create table if not exists public.users (
  id          uuid primary key,
  email       text not null,
  full_name   text,
  avatar_url  text,
  role        text not null default 'user',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.users is
  'Mirror of TubeProxies profiles (user accounts). Source of truth is the '
  'TubeProxies project; kept in sync by the mirror-user edge function. '
  'NOT to be confused with public.profiles (= browser profiles).';

alter table public.users enable row level security;

-- A user may read their own mirror row, and the rows of anyone who
-- shares a workspace with them (so Members / attribution UIs resolve
-- names without hitting auth.users). Never writable by clients — only
-- the edge function (service_role, bypasses RLS) writes here.
drop policy if exists "users.read self" on public.users;
create policy "users.read self" on public.users
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "users.read co-members" on public.users;
create policy "users.read co-members" on public.users
  for select to authenticated
  using (
    id in (
      select wm.user_id
      from public.workspace_members wm
      where wm.workspace_id in (select public.user_workspace_ids())
    )
  );

-- ── 1b. backfill mirror from existing auth.users ───────────────────
-- This project already has legacy GoTrue users (created before JWTs came
-- from TubeProxies) that own workspaces / memberships / browser profiles.
-- Seed public.users from them FIRST so the FK re-point below does not
-- orphan those rows. Idempotent (on conflict do nothing); TubeProxies's
-- mirror-user webhook keeps everything current from here on.
insert into public.users (id, email, full_name, avatar_url, role, created_at)
select
  u.id,
  coalesce(u.email::text, u.id::text || '@legacy.local'),
  nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
  nullif(u.raw_user_meta_data->>'avatar_url', ''),
  'user',
  coalesce(u.created_at, now())
from auth.users u
on conflict (id) do nothing;

-- ── 2. re-point FKs auth.users -> public.users ─────────────────────
-- Generic: find every FK constraint in schema public whose referenced
-- table is auth.users, drop it, and recreate it against public.users
-- preserving the referencing column, ON DELETE action, and ON UPDATE.
do $$
declare
  r record;
  v_del text;
  v_upd text;
begin
  for r in
    select
      con.conname,
      rel.relname          as tbl,
      con.confdeltype,
      con.confupdtype,
      (select string_agg(quote_ident(att.attname), ',' order by k.ord)
       from unnest(con.conkey) with ordinality as k(attnum, ord)
       join pg_attribute att
         on att.attrelid = con.conrelid and att.attnum = k.attnum
      ) as cols
    from pg_constraint con
    join pg_class rel   on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_class fref  on fref.oid = con.confrelid
    join pg_namespace fn on fn.oid = fref.relnamespace
    where con.contype = 'f'
      and n.nspname = 'public'
      and fn.nspname = 'auth'
      and fref.relname = 'users'
  loop
    v_del := case r.confdeltype
      when 'c' then ' on delete cascade'
      when 'n' then ' on delete set null'
      when 'd' then ' on delete set default'
      when 'r' then ' on delete restrict'
      else '' end;
    v_upd := case r.confupdtype
      when 'c' then ' on update cascade'
      when 'n' then ' on update set null'
      else '' end;

    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%s) '
      || 'references public.users(id)%s%s',
      r.tbl, r.conname, r.cols, v_del, v_upd
    );
  end loop;
end;
$$;

-- ── 3. first-time provisioning RPC (replaces auth.users trigger) ────
-- Called by the mirror-user edge function AFTER upserting the mirror
-- row. Bootstraps a workspace + owner membership + default roles for a
-- brand-new user, exactly like the old handle_new_user() trigger, but
-- idempotent: if the user already owns/belongs to any workspace we do
-- nothing. seed_default_roles stays revoked from authenticated; this
-- SECURITY DEFINER wrapper is the only new caller.
create or replace function public.provision_mirrored_user(
  p_user_id uuid,
  p_workspace_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws_id   uuid;
  v_ws_name text;
begin
  -- Already provisioned? (owner of, or member of, any workspace.)
  select wm.workspace_id into v_ws_id
  from public.workspace_members wm
  where wm.user_id = p_user_id
  limit 1;
  if v_ws_id is not null then
    return v_ws_id;
  end if;

  v_ws_name := coalesce(nullif(trim(p_workspace_name), ''), 'My Workspace');
  if length(v_ws_name) > 80 then
    v_ws_name := left(v_ws_name, 80);
  end if;

  insert into public.workspaces (name, owner_id)
  values (v_ws_name, p_user_id)
  returning id into v_ws_id;

  insert into public.workspace_members (workspace_id, user_id)
  values (v_ws_id, p_user_id)
  on conflict do nothing;

  perform public.seed_default_roles(v_ws_id, p_user_id);
  return v_ws_id;
end;
$$;

-- Internal only — invoked by the edge function via service_role (which
-- bypasses grants). Keep it revoked from authenticated so a client
-- can't self-provision an arbitrary user id.
revoke all on function public.provision_mirrored_user(uuid, text) from public, anon, authenticated;

-- ── 4. retire the auth.users signup trigger ────────────────────────
-- Under JWKS this can never fire (no GoTrue signup in this project),
-- but dropping it removes a dangling dependency on auth.users and makes
-- the model explicit. handle_new_user() itself is left defined but
-- unused (harmless) to keep older migrations re-runnable.
drop trigger if exists on_auth_user_created on auth.users;

notify pgrst, 'reload schema';
