-- ===================================================================
-- 0024_profile_session_sync.sql
-- Cross-device encrypted profile SESSION sync ("Sync" feature).
--
-- Metadata sync (profiles/proxies/tags/roles/extension records/tokens)
-- already works. What does NOT sync is a profile's real Chromium
-- --user-data-dir (cookies, local storage, IndexedDB, logins, history) —
-- it's local to whichever machine launched the profile. This feature
-- packs an allowlisted subset of that dir into a single compressed,
-- ENCRYPTED archive on profile close, uploads it as a versioned snapshot
-- to Supabase Storage, and restores it on the next launch (any machine).
--
-- The single-active-session LOCK that makes this safe already exists:
-- try_acquire_profile_lock / heartbeat / release / force_release on the
-- profiles table (0001_init.sql:312). We reuse it verbatim — this
-- migration adds only the snapshot bookkeeping + storage + permission.
--
-- Encryption happens on the client (main process, AES-256-GCM) using a
-- per-workspace key the `session-key` Edge Function derives from the
-- SESSION_ENC_KEY server secret — same trust model as TOTP_ENC_KEY.
-- Plaintext session data never reaches Postgres or Storage.
--
-- Idempotent where practical; on-conflict guards throughout.
-- ===================================================================

-- ── 1. Master toggle on the workspace ──────────────────────────────────────
-- Off by default → behaviour stays local-first (today's behaviour). Gated by
-- workspace.edit_settings; the existing settings UPDATE policy on workspaces
-- already restricts who may write non-billing columns, so no new policy.
alter table workspaces
  add column if not exists session_sync_enabled boolean not null default false;

-- ── 2. Snapshot bookkeeping (one row per profile) ──────────────────────────
-- The actual archive bytes live in Storage (bucket `sessions`); this row is
-- the cross-device pointer + status the realtime UI reads. Lock state is NOT
-- duplicated here — it lives on profiles.open_* (see 0001).
create table if not exists profile_session_sync (
  profile_id              uuid primary key references profiles on delete cascade,
  workspace_id            uuid not null references workspaces on delete cascade,
  latest_snapshot_version integer not null default 0,
  size_bytes              bigint  not null default 0,
  -- SHA-256 (hex) of the *plaintext* archive, checked after decrypt on
  -- download. Never contains session content, only a digest.
  checksum                text,
  -- Whether the last snapshot bundled Default/History (user toggle).
  include_history         boolean not null default false,
  last_synced_at          timestamptz,
  last_synced_by          uuid references auth.users on delete set null,
  last_synced_device      text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_pss_workspace on profile_session_sync (workspace_id);

alter table profile_session_sync enable row level security;

-- A member may READ sync status for any profile they can view.
create policy "session_sync.view" on profile_session_sync for select
  using (check_user_permission((select auth.uid()), 'profiles.view', workspace_id));

-- Writing the pointer (after a successful upload) or restoring is a
-- credential-grade action → require sessions.sync AND respect per-profile
-- assignment (a member may only sync/restore profiles assigned to them, or
-- unassigned ones; admins with the permission are unaffected because the
-- assignment predicate below OR-s in the null case). Mirrors how launch
-- treats assignment.
create policy "session_sync.write" on profile_session_sync for insert
  with check (
    check_user_permission((select auth.uid()), 'sessions.sync', workspace_id)
    and exists (
      select 1 from public.profiles p
      where p.id = profile_session_sync.profile_id
        and (p.assigned_to is null or p.assigned_to = (select auth.uid())
             or check_user_permission((select auth.uid()), 'profiles.assign_member', workspace_id))
    )
  );

create policy "session_sync.update" on profile_session_sync for update
  using (
    check_user_permission((select auth.uid()), 'sessions.sync', workspace_id)
    and exists (
      select 1 from public.profiles p
      where p.id = profile_session_sync.profile_id
        and (p.assigned_to is null or p.assigned_to = (select auth.uid())
             or check_user_permission((select auth.uid()), 'profiles.assign_member', workspace_id))
    )
  )
  with check (
    check_user_permission((select auth.uid()), 'sessions.sync', workspace_id)
  );

-- ── 3. New permission key: sessions.sync ───────────────────────────────────
-- Credential-grade: pulling a decrypted session === exporting logins, so it
-- sits alongside cookies.export / twofa.export in the danger tier.
insert into public.app_permissions (permission_key, category, label, description) values
  ('sessions.sync', 'accounts', 'Sync browser sessions',
   'Snapshot, restore, and download a profile''s encrypted browser session (cookies, logins, storage) across devices.')
on conflict (permission_key) do nothing;

-- Grant to OWNER ONLY of every existing workspace — same tier as the other
-- credential-export keys (cookies.export / twofa.export / workspace.export_data
-- are all withheld from Admin by seed_default_roles). An admin can widen it in
-- the Roles page. Owner already gets every permission, but grant explicitly so
-- the key is present even if the row above hit the on-conflict no-op.
do $$
declare
  v_ws uuid;
  v_role uuid;
begin
  for v_ws in select id from public.workspaces loop
    select id into v_role from public.app_roles
      where workspace_id = v_ws and name = 'Owner';
    if v_role is not null then
      insert into public.role_permissions (role_id, workspace_id, permission_key)
      values (v_role, v_ws, 'sessions.sync')
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- New workspaces: fold sessions.sync into the Admin exclusion list so
-- seed_default_roles() keeps it Owner-only. Owner's grant is "every
-- permission" (unchanged), so we only need to patch the Admin exclusion.
create or replace function public.seed_default_roles(
  p_workspace_id uuid,
  p_owner_user_id uuid
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id    uuid;
  v_admin_id    uuid;
  v_editor_id   uuid;
  v_uploader_id uuid;
  v_viewer_id   uuid;
begin
  insert into public.app_roles (workspace_id, name, hierarchy, is_protected, is_delete_protected, is_default, color, description) values
    (p_workspace_id, 'Owner',    0,   true,  true,  true, '#E60000', 'Full control. Can manage billing, roles, and the workspace itself.'),
    (p_workspace_id, 'Admin',    100, false, false, true, '#8B5CF6', 'Manages profiles, members, groups, and extensions.'),
    (p_workspace_id, 'Editor',   200, false, false, true, '#10B981', 'Launch and manage assigned profiles. No billing or team control.'),
    (p_workspace_id, 'Uploader', 250, false, false, true, '#F59E0B', 'Uploads and launches profiles. Cannot manage members or settings.'),
    (p_workspace_id, 'Viewer',   300, false, false, true, '#6366F1', 'Read-only. Can launch profiles but not modify them.');

  select id into v_owner_id    from public.app_roles where workspace_id = p_workspace_id and name = 'Owner';
  select id into v_admin_id    from public.app_roles where workspace_id = p_workspace_id and name = 'Admin';
  select id into v_editor_id   from public.app_roles where workspace_id = p_workspace_id and name = 'Editor';
  select id into v_uploader_id from public.app_roles where workspace_id = p_workspace_id and name = 'Uploader';
  select id into v_viewer_id   from public.app_roles where workspace_id = p_workspace_id and name = 'Viewer';

  -- Owner: every permission
  insert into public.role_permissions (role_id, workspace_id, permission_key)
  select v_owner_id, p_workspace_id, permission_key from public.app_permissions;

  -- Admin: everything except workspace-danger + destructive-secret toggles
  -- (sessions.sync added to the danger list — credential-grade like the exports)
  insert into public.role_permissions (role_id, workspace_id, permission_key)
  select v_admin_id, p_workspace_id, permission_key
  from public.app_permissions
  where permission_key not in (
    'workspace.delete', 'billing.view', 'billing.manage',
    'roles.create', 'roles.edit', 'roles.delete',
    'twofa.reveal_seed', 'twofa.export', 'workspace.export_data',
    'sessions.sync'
  );

  -- Editor: §3 defaults
  insert into public.role_permissions (role_id, workspace_id, permission_key)
  select v_editor_id, p_workspace_id, k from unnest(array[
    'profiles.view', 'profiles.launch', 'profiles.create', 'profiles.edit',
    'bulk.create_profiles', 'bulk.edit_profiles', 'bulk.delete_profiles',
    'accounts.view', 'cookies.import',
    'twofa.view', 'twofa.generate', 'twofa.manage_tokens',
    'proxies.view', 'proxies.view_credentials', 'proxies.test',
    'automations.view', 'automations.edit', 'synchronizer.run',
    'activity.view', 'groups.view', 'tags.create'
  ]) as k;

  -- Uploader
  insert into public.role_permissions (role_id, workspace_id, permission_key)
  select v_uploader_id, p_workspace_id, k from unnest(array[
    'profiles.view', 'profiles.launch', 'profiles.create',
    'bulk.create_profiles', 'accounts.view', 'cookies.import',
    'twofa.view', 'proxies.view', 'proxies.test',
    'automations.view', 'automations.run', 'synchronizer.run',
    'groups.view'
  ]) as k;

  -- Viewer
  insert into public.role_permissions (role_id, workspace_id, permission_key)
  select v_viewer_id, p_workspace_id, k from unnest(array[
    'profiles.view', 'profiles.launch', 'groups.view',
    'accounts.view', 'twofa.view', 'proxies.view', 'automations.view'
  ]) as k;

  -- Assign workspace creator as Owner
  insert into public.user_roles (user_id, role_id, workspace_id, assigned_by)
  values (p_owner_user_id, v_owner_id, p_workspace_id, p_owner_user_id);
end;
$$;
grant execute on function public.seed_default_roles(uuid, uuid) to authenticated;

-- ── 4. Storage bucket + object RLS ─────────────────────────────────────────
-- Private bucket; every object path is sessions/{workspaceId}/{profileId}/
-- {version}.enc. Access is authorised by decomposing the path: the first
-- folder is the workspace id, the second is the profile id.
insert into storage.buckets (id, name, public)
values ('sessions', 'sessions', false)
on conflict (id) do nothing;

-- Helper: does the caller hold sessions.sync in the workspace named by the
-- object's first path segment, AND is the profile (2nd segment) assigned to
-- them (or unassigned / they can reassign)? SECURITY DEFINER so it can read
-- profiles without the caller needing a direct grant; search_path pinned.
create or replace function public.can_access_session_object(p_name text)
returns boolean
language plpgsql security definer stable set search_path = '' as $$
declare
  v_ws   uuid;
  v_prof uuid;
begin
  -- storage.foldername(name) → text[] of path segments.
  v_ws   := (storage.foldername(p_name))[1]::uuid;
  v_prof := (storage.foldername(p_name))[2]::uuid;
  if v_ws is null or v_prof is null then
    return false;
  end if;
  if not public.check_user_permission((select auth.uid()), 'sessions.sync', v_ws) then
    return false;
  end if;
  return exists (
    select 1 from public.profiles p
    where p.id = v_prof and p.workspace_id = v_ws
      and (p.assigned_to is null or p.assigned_to = (select auth.uid())
           or public.check_user_permission((select auth.uid()), 'profiles.assign_member', v_ws))
  );
exception when others then
  -- Malformed path (bad uuid cast etc.) → deny.
  return false;
end;
$$;
grant execute on function public.can_access_session_object(text) to authenticated;

create policy "sessions.objects.read" on storage.objects for select
  to authenticated
  using (bucket_id = 'sessions' and public.can_access_session_object(name));

create policy "sessions.objects.insert" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'sessions' and public.can_access_session_object(name));

create policy "sessions.objects.update" on storage.objects for update
  to authenticated
  using (bucket_id = 'sessions' and public.can_access_session_object(name))
  with check (bucket_id = 'sessions' and public.can_access_session_object(name));

-- Delete needed for last-N retention pruning.
create policy "sessions.objects.delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'sessions' and public.can_access_session_object(name));

-- ── 5. keep updated_at fresh ───────────────────────────────────────────────
create or replace function public.touch_profile_session_sync()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_pss on profile_session_sync;
create trigger trg_touch_pss before update on profile_session_sync
  for each row execute function public.touch_profile_session_sync();

-- ── 6. Reload PostgREST schema cache ───────────────────────────────────────
notify pgrst, 'reload schema';
