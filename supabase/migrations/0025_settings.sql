-- ===================================================================
-- 0025_settings.sql
-- Settings hub: workspace defaults + personal-account settings +
-- security policies + IP allowlist + notification prefs + login
-- sessions + the destructive danger-zone RPCs.
--
-- Scope split (mirrors the UI):
--   • personal/device  → localStorage only (theme/accent/density) — NO db.
--   • personal/account → user_notification_prefs, user_login_sessions
--                        (keyed by auth.uid(), self-RLS).
--   • workspace        → new columns on `workspaces` + workspace_ip_allowlist,
--                        gated by the EXISTING workspace.edit_settings UPDATE
--                        policy (0002_full_schema.sql:412) — no new ws policy.
--
-- The billing triggers (0003) still block plan/stripe_* regardless, so a
-- member with workspace.edit_settings can write these new columns but never
-- billing columns. Idempotent throughout.
-- ===================================================================

-- ── 1. Workspace-scope defaults + security policies (new columns) ───────────
-- Covered by the existing "workspace.edit_settings" UPDATE policy on
-- workspaces — writing these requires that permission, RLS-enforced.
alter table workspaces
  add column if not exists default_launch_behavior text not null default 'window'
    check (default_launch_behavior in ('window', 'tab', 'headless')),
  add column if not exists default_group_id uuid references groups on delete set null,
  add column if not exists interface_language text not null default 'en',
  -- Baseline applied to NEW profiles. jsonb (not 15 columns) so the shape can
  -- evolve without a migration; validated client-side in lib/settings.ts.
  -- Shape: { os, browser_core, webrtc_mode, canvas_noise, auto_rotate }.
  add column if not exists fingerprint_defaults jsonb not null default '{}'::jsonb,
  -- Shape: { proxy_source, rotate_on_launch, kill_switch, timeout_seconds, max_retries }.
  add column if not exists network_defaults jsonb not null default '{}'::jsonb,
  -- Workspace security policies.
  add column if not exists require_2fa boolean not null default false,
  add column if not exists session_timeout_hours int not null default 24
    check (session_timeout_hours >= 0);

-- ── 2. Workspace IP allowlist ──────────────────────────────────────────────
-- Empty allowlist = allow all (enforced in check_workspace_ip_access below).
create table if not exists workspace_ip_allowlist (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  -- inet accepts both a single host (203.0.113.4) and CIDR (198.51.100.0/24).
  cidr         inet not null,
  label        text,
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),
  unique (workspace_id, cidr)
);

create index if not exists idx_ip_allowlist_workspace on workspace_ip_allowlist (workspace_id);

alter table workspace_ip_allowlist enable row level security;

-- View: anyone who can view workspace settings.
create policy "ip_allowlist.view" on workspace_ip_allowlist for select
  using (check_user_permission((select auth.uid()), 'workspace.view_settings', workspace_id));

-- Write (insert/update/delete): workspace.edit_settings.
create policy "ip_allowlist.insert" on workspace_ip_allowlist for insert
  with check (check_user_permission((select auth.uid()), 'workspace.edit_settings', workspace_id));
create policy "ip_allowlist.update" on workspace_ip_allowlist for update
  using (check_user_permission((select auth.uid()), 'workspace.edit_settings', workspace_id))
  with check (check_user_permission((select auth.uid()), 'workspace.edit_settings', workspace_id));
create policy "ip_allowlist.delete" on workspace_ip_allowlist for delete
  using (check_user_permission((select auth.uid()), 'workspace.edit_settings', workspace_id));

-- Server-side access check: is p_ip allowed into p_workspace? Empty list = yes.
-- SECURITY DEFINER so it reads the allowlist without a per-caller grant.
create or replace function public.check_workspace_ip_access(p_workspace_id uuid, p_ip inet)
returns boolean
language sql security definer stable set search_path = '' as $$
  select not exists (select 1 from public.workspace_ip_allowlist where workspace_id = p_workspace_id)
      or exists (
        select 1 from public.workspace_ip_allowlist
        where workspace_id = p_workspace_id and p_ip <<= cidr
      );
$$;
grant execute on function public.check_workspace_ip_access(uuid, inet) to authenticated;

-- Lockout guard the UI calls BEFORE saving: would p_ip still have access if the
-- allowlist were exactly p_cidrs? Prevents the admin locking themselves out.
create or replace function public.ip_allowlist_would_cover(p_cidrs text[], p_ip inet)
returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(p_cidrs) = 0
      or exists (select 1 from unnest(p_cidrs) c where p_ip <<= c::inet);
$$;
grant execute on function public.ip_allowlist_would_cover(text[], inet) to authenticated;

-- ── 3. Personal/account: notification prefs (per user, self-RLS) ────────────
-- One row per user holding delivery config; per-event toggles live in the
-- jsonb `events` map keyed by event_key → boolean. Simple + no fan-out.
create table if not exists user_notification_prefs (
  user_id            uuid primary key references auth.users on delete cascade,
  -- { proxy_expiring, profile_launched, member_changed, automation_done, weekly_summary }
  events             jsonb not null default '{}'::jsonb,
  notification_email text,
  webhook_url        text,
  login_alerts       boolean not null default true,
  updated_at         timestamptz not null default now()
);

alter table user_notification_prefs enable row level security;

create policy "notif_prefs.self" on user_notification_prefs for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── 4. Personal/account: login sessions ledger ─────────────────────────────
-- GoTrue owns refresh tokens, but the anon client can't enumerate/revoke them.
-- We keep our own ledger written on login/heartbeat; the `sessions` Edge
-- Function (service_role) reconciles it with auth + performs real revocation.
-- `revoked_at` non-null → the client signs that session out on next check;
-- "Sign out everywhere" is a real admin signOut done in the edge function.
create table if not exists user_login_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  -- Stable per-device id the renderer generates once and persists locally.
  device_id     text not null,
  device        text,             -- "MacBook Pro"
  browser       text,             -- "Chrome"
  ip            inet,
  location      text,             -- "Phoenix, AZ" (best-effort, from ip lookup)
  created_at    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  revoked_at    timestamptz,
  unique (user_id, device_id)
);

create index if not exists idx_login_sessions_user on user_login_sessions (user_id);

alter table user_login_sessions enable row level security;

-- A user sees + upserts + soft-revokes ONLY their own sessions. Hard delete
-- and cross-session revoke of *other* devices is done by the edge function
-- (service_role), which bypasses RLS.
create policy "login_sessions.self.select" on user_login_sessions for select
  using (user_id = (select auth.uid()));
create policy "login_sessions.self.insert" on user_login_sessions for insert
  with check (user_id = (select auth.uid()));
create policy "login_sessions.self.update" on user_login_sessions for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- keep updated_at / last_seen fresh helpers -------------------------------------------------
create or replace function public.touch_user_notification_prefs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_touch_notif_prefs on user_notification_prefs;
create trigger trg_touch_notif_prefs before update on user_notification_prefs
  for each row execute function public.touch_user_notification_prefs();

-- ── 5. Danger-zone RPCs (destructive, permission-gated inside) ──────────────

-- 5a. Wipe cookies/sessions across every profile in a workspace. We don't hold
-- cookie bytes in Postgres (they live in each profile's local --user-data-dir
-- and the encrypted `sessions` storage bucket), so this clears the sync
-- pointers + storage objects and bumps a marker the launcher honors to purge
-- the local dir on next launch. Requires workspace.edit_settings.
alter table profiles
  add column if not exists cookies_wiped_at timestamptz;

create or replace function public.wipe_workspace_cookies(p_workspace_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.check_user_permission((select auth.uid()), 'workspace.edit_settings', p_workspace_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Mark every profile so the launcher purges its local session dir next open.
  update public.profiles set cookies_wiped_at = now() where workspace_id = p_workspace_id;
  -- Drop cross-device snapshot pointers (storage objects pruned client-side /
  -- by the storage lifecycle; the pointer removal invalidates restores).
  delete from public.profile_session_sync where workspace_id = p_workspace_id;
end;
$$;
grant execute on function public.wipe_workspace_cookies(uuid) to authenticated;

-- 5b. Leave the workspace (remove yourself). Owners cannot leave their own
-- workspace (must delete or transfer, which isn't built yet) — fail clearly.
create or replace function public.leave_workspace(p_workspace_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if exists (select 1 from public.workspaces where id = p_workspace_id and owner_id = v_uid) then
    raise exception 'owner cannot leave their own workspace' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.workspace_members
                 where workspace_id = p_workspace_id and user_id = v_uid) then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  delete from public.user_roles where workspace_id = p_workspace_id and user_id = v_uid;
  delete from public.workspace_members where workspace_id = p_workspace_id and user_id = v_uid;
end;
$$;
grant execute on function public.leave_workspace(uuid) to authenticated;

-- 5c. Delete the whole workspace. Owner-only (workspace.delete permission,
-- which seed_default_roles grants to Owner only). All child rows cascade via
-- their FKs (profiles, proxies, groups, extensions, authenticator_tokens,
-- workspace_members, user_roles, role_permissions, ip allowlist, …). We assert
-- the permission then delete the workspace row; FKs do the rest.
create or replace function public.delete_workspace(p_workspace_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.check_user_permission((select auth.uid()), 'workspace.delete', p_workspace_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from public.workspaces where id = p_workspace_id;
end;
$$;
grant execute on function public.delete_workspace(uuid) to authenticated;

-- ── 6. Seed sensible fingerprint/network defaults on existing workspaces ────
-- Non-destructive: only fills empty jsonb so re-runs are safe.
update workspaces set fingerprint_defaults = jsonb_build_object(
  'os', 'win', 'browser_core', '142', 'webrtc_mode', 'forward',
  'canvas_noise', true, 'auto_rotate', false
) where fingerprint_defaults = '{}'::jsonb;

update workspaces set network_defaults = jsonb_build_object(
  'proxy_source', 'pool', 'rotate_on_launch', false, 'kill_switch', true,
  'timeout_seconds', 30, 'max_retries', 3
) where network_defaults = '{}'::jsonb;

-- ── 7. Reload PostgREST schema cache ───────────────────────────────────────
notify pgrst, 'reload schema';
