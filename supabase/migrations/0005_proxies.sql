-- ===================================================================
-- Proxies feature.
--
-- Two sources of proxies:
--   * 'tubeproxies' — synced from the user's TubeProxies account via
--     the API (Phase 3 work). Credentials are managed upstream and are
--     read-only here (a trigger blocks edits to host/port/credentials).
--   * 'custom'      — manually added by the user (any provider).
--
-- Profiles reference proxies via profiles.proxy_id (nullable, ON DELETE
-- SET NULL — deleting a proxy unbinds it from profiles instead of
-- cascading the delete).
-- ===================================================================

-- 1. proxies table -----------------------------------------------------
create table proxies (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces on delete cascade,
  -- Source: where this proxy came from
  source              text not null check (source in ('tubeproxies', 'custom'))
                        default 'custom',
  tubeproxies_ip_id   text,                        -- only set when source = 'tubeproxies'
  -- Display name (user-editable, e.g. "Office US #1")
  label               text,
  -- Connection
  proxy_type          text not null check (proxy_type in ('http','https','socks5')),
  host                text not null,
  port                integer not null check (port > 0 and port <= 65535),
  username            text,
  password_encrypted  text,                        -- TODO: wire Supabase Vault in Phase 5
  -- Geo (cached from TubeProxies for source='tubeproxies'; user-set for custom)
  country_code        text,                        -- 'US', 'GB', etc.
  country_name        text,
  city                text,
  region              text,                        -- 'NY', 'CA', 'LON', etc.
  timezone            text,                        -- 'America/New_York'
  -- Lifecycle
  status              text not null default 'active'
                        check (status in ('active','expired','released','error')),
  last_synced_at      timestamptz,                 -- last refresh from TubeProxies API
  expires_at          timestamptz,                 -- when the proxy lease ends
  -- Operational
  last_known_egress_ip inet,                       -- mirrors profiles.last_known_egress_ip
  last_tested_at      timestamptz,
  last_test_ok        boolean,
  notes               text,
  created_by          uuid references auth.users on delete set null,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  -- TubeProxies IP IDs are unique per workspace (can't insert the same
  -- TubeProxies-sourced proxy twice). Custom proxies aren't deduped —
  -- users can add the same host:port multiple times if they want.
  unique (workspace_id, tubeproxies_ip_id)
);

create index idx_proxies_workspace on proxies(workspace_id);
create index idx_proxies_workspace_status on proxies(workspace_id, status);
create index idx_proxies_workspace_country on proxies(workspace_id, country_code);
create index idx_proxies_workspace_source on proxies(workspace_id, source);

-- 2. profiles → proxies FK --------------------------------------------
-- ON DELETE SET NULL so deleting a proxy unbinds it from profiles
-- without cascading the profile delete.
alter table profiles
  add column proxy_id uuid references proxies on delete set null;
create index idx_profiles_proxy on profiles(proxy_id);

-- 3. updated_at trigger -----------------------------------------------
create trigger proxies_updated_at before update on proxies
  for each row execute function set_updated_at();

-- 4. Edit-protection for TubeProxies-sourced rows ---------------------
-- Local edits to host/port/credentials would desync from TubeProxies.
-- Block them. label / notes / country_name etc. stay editable.
create or replace function block_tubeproxies_proxy_credential_edits()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.source = 'tubeproxies' and (
    old.host is distinct from new.host
    or old.port is distinct from new.port
    or old.username is distinct from new.username
    or old.password_encrypted is distinct from new.password_encrypted
    or old.tubeproxies_ip_id is distinct from new.tubeproxies_ip_id
    or old.proxy_type is distinct from new.proxy_type
    or old.source is distinct from new.source
  ) then
    raise exception 'Cannot edit credentials of a TubeProxies-sourced proxy. Refresh from inventory or delete + re-add.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists proxies_block_tubeproxies_credential_edits on proxies;
create trigger proxies_block_tubeproxies_credential_edits
  before update on proxies
  for each row execute function block_tubeproxies_proxy_credential_edits();

-- 5. Permission catalogue rows ----------------------------------------
insert into app_permissions (permission_key, category, label, description) values
  ('proxies.view',    'proxies', 'View proxies',
    'See the proxies inventory.'),
  ('proxies.create',  'proxies', 'Add proxies',
    'Add custom proxies and import from TubeProxies.'),
  ('proxies.edit',    'proxies', 'Edit proxies',
    'Change proxy label, notes, type. TubeProxies-sourced credentials are always read-only.'),
  ('proxies.delete',  'proxies', 'Delete proxies',
    'Remove proxies (releases TubeProxies-sourced ones back to inventory).'),
  ('proxies.assign',  'proxies', 'Assign proxy to profile',
    'Bind/unbind proxies to profiles.'),
  ('proxies.refresh', 'proxies', 'Sync TubeProxies inventory',
    'Pull the latest inventory from your TubeProxies account.'),
  ('proxies.test',    'proxies', 'Test proxy connection',
    'Run a connectivity check against any proxy.');

-- 6. RLS --------------------------------------------------------------
alter table proxies enable row level security;

create policy "proxies.view" on proxies for select
  using (check_user_permission((select auth.uid()), 'proxies.view', workspace_id));

create policy "proxies.create" on proxies for insert
  with check (check_user_permission((select auth.uid()), 'proxies.create', workspace_id));

create policy "proxies.edit" on proxies for update
  using (check_user_permission((select auth.uid()), 'proxies.edit', workspace_id))
  with check (check_user_permission((select auth.uid()), 'proxies.edit', workspace_id));

create policy "proxies.delete" on proxies for delete
  using (check_user_permission((select auth.uid()), 'proxies.delete', workspace_id));

-- 7. Backfill the new permissions into existing default roles ---------
-- New workspaces created after this migration get the right grants
-- via the updated seed_default_roles() (below). Existing workspaces
-- need a one-time backfill of their default Owner / Manager / Operator
-- / Viewer roles.
do $$
declare
  v_workspace_id uuid;
  v_owner_id    uuid;
  v_manager_id  uuid;
  v_operator_id uuid;
  v_viewer_id   uuid;
begin
  for v_workspace_id in select id from public.workspaces loop
    select id into v_owner_id    from public.app_roles
      where workspace_id = v_workspace_id and name = 'Owner';
    select id into v_manager_id  from public.app_roles
      where workspace_id = v_workspace_id and name = 'Manager';
    select id into v_operator_id from public.app_roles
      where workspace_id = v_workspace_id and name = 'Operator';
    select id into v_viewer_id   from public.app_roles
      where workspace_id = v_workspace_id and name = 'Viewer';

    -- Owner: all proxy permissions
    if v_owner_id is not null then
      insert into public.role_permissions (role_id, workspace_id, permission_key)
      select v_owner_id, v_workspace_id, permission_key
        from public.app_permissions
        where category = 'proxies'
      on conflict do nothing;
    end if;

    -- Manager: everything except none excluded
    if v_manager_id is not null then
      insert into public.role_permissions (role_id, workspace_id, permission_key)
      select v_manager_id, v_workspace_id, permission_key
        from public.app_permissions
        where category = 'proxies'
      on conflict do nothing;
    end if;

    -- Operator: view + assign + test (use proxies, not manage inventory)
    if v_operator_id is not null then
      insert into public.role_permissions (role_id, workspace_id, permission_key) values
        (v_operator_id, v_workspace_id, 'proxies.view'),
        (v_operator_id, v_workspace_id, 'proxies.assign'),
        (v_operator_id, v_workspace_id, 'proxies.test')
      on conflict do nothing;
    end if;

    -- Viewer: view only
    if v_viewer_id is not null then
      insert into public.role_permissions (role_id, workspace_id, permission_key) values
        (v_viewer_id, v_workspace_id, 'proxies.view')
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- 8. Update seed_default_roles() so NEW workspaces also get the grants
create or replace function seed_default_roles(
  p_workspace_id uuid,
  p_owner_user_id uuid
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id    uuid;
  v_manager_id  uuid;
  v_operator_id uuid;
  v_viewer_id   uuid;
begin
  insert into public.app_roles (workspace_id, name, hierarchy, is_protected, is_delete_protected, is_default, color, description) values
    (p_workspace_id, 'Owner',    0,   true,  true,  true, '#E60000', 'Full control. Can manage billing, roles, and the workspace itself.'),
    (p_workspace_id, 'Manager',  100, false, false, true, '#F59E0B', 'Manages profiles, members, groups, proxies, and extensions.'),
    (p_workspace_id, 'Operator', 200, false, false, true, '#10B981', 'Day-to-day profile work — create, edit, launch.'),
    (p_workspace_id, 'Viewer',   300, false, false, true, '#6366F1', 'Read-only. Can launch profiles but not modify them.');

  select id into v_owner_id    from public.app_roles where workspace_id = p_workspace_id and name = 'Owner';
  select id into v_manager_id  from public.app_roles where workspace_id = p_workspace_id and name = 'Manager';
  select id into v_operator_id from public.app_roles where workspace_id = p_workspace_id and name = 'Operator';
  select id into v_viewer_id   from public.app_roles where workspace_id = p_workspace_id and name = 'Viewer';

  -- Owner: every permission
  insert into public.role_permissions (role_id, workspace_id, permission_key)
  select v_owner_id, p_workspace_id, permission_key from public.app_permissions;

  -- Manager: everything except workspace.delete, billing.*, roles.create/edit/delete
  insert into public.role_permissions (role_id, workspace_id, permission_key)
  select v_manager_id, p_workspace_id, permission_key
  from public.app_permissions
  where permission_key not in (
    'workspace.delete',
    'billing.view', 'billing.manage',
    'roles.create', 'roles.edit', 'roles.delete'
  );

  -- Operator: profile work + tag-create + group-view + proxy use
  insert into public.role_permissions (role_id, workspace_id, permission_key) values
    (v_operator_id, p_workspace_id, 'profiles.view'),
    (v_operator_id, p_workspace_id, 'profiles.create'),
    (v_operator_id, p_workspace_id, 'profiles.edit'),
    (v_operator_id, p_workspace_id, 'profiles.launch'),
    (v_operator_id, p_workspace_id, 'tags.create'),
    (v_operator_id, p_workspace_id, 'groups.view'),
    (v_operator_id, p_workspace_id, 'proxies.view'),
    (v_operator_id, p_workspace_id, 'proxies.assign'),
    (v_operator_id, p_workspace_id, 'proxies.test');

  -- Viewer: read-only + launch + proxy view
  insert into public.role_permissions (role_id, workspace_id, permission_key) values
    (v_viewer_id, p_workspace_id, 'profiles.view'),
    (v_viewer_id, p_workspace_id, 'profiles.launch'),
    (v_viewer_id, p_workspace_id, 'groups.view'),
    (v_viewer_id, p_workspace_id, 'proxies.view');

  insert into public.user_roles (user_id, role_id, workspace_id, assigned_by)
  values (p_owner_user_id, v_owner_id, p_workspace_id, p_owner_user_id);
end;
$$;

-- seed_default_roles is intentionally NOT granted to authenticated
-- (CRIT-1 from 0003 stays in effect — it's only callable via the
-- SECURITY DEFINER wrappers create_workspace and handle_new_user).

notify pgrst, 'reload schema';
