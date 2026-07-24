-- ===================================================================
-- TubeProxies Browser — consolidated schema upgrade.
--
-- This migration is everything that was previously planned across
-- 0002–0007, squashed into one. Designed to be applied to a database
-- that has 0001_init.sql already in place.
--
-- Sections:
--   1. Permission catalogue (app_permissions) + 32 seeded keys
--   2. Workspace-scoped roles (app_roles) with hierarchy + protection flags
--   3. role_permissions (M:N) + user_roles assignment
--   4. Drop the legacy workspace_members.role enum (RBAC replaces it)
--   5. Plan catalogue (plans + plan_features) — single source of truth
--      for what each subscription tier allows
--   6. ONE permission helper: check_user_permission(uid, key, wid)
--   7. ONE plan helper:       check_plan_feature(plan_key, feature_key)
--   8. seed_default_roles()   — called per workspace on creation
--   9. Updated create_workspace() RPC + handle_new_user() trigger
--  10. Drop ALL old policies; recreate using check_user_permission()
--      with (SELECT auth.uid()) per Scene Flow Pro perf rule
--  11. Plan-feature-gated INSERT policies on bulk/extensions/etc.
--  12. Billing-column write protection (Stripe-only via service_role)
--  13. Role hierarchy guard + delete protection (defense in depth)
--  14. ON DELETE SET NULL on every audit-trail user FK
--  15. One-workspace-as-owner constraint (Soft model: a user owns at
--      most one workspace, but can be a Member of others)
--  16. Indexes on every RLS-checked column
-- ===================================================================

-- ===================================================================
-- 1. Permission catalogue
-- ===================================================================
create table app_permissions (
  permission_key text primary key,
  category       text not null,
  label          text not null,
  description    text
);

insert into app_permissions (permission_key, category, label, description) values
  -- Profiles
  ('profiles.view',          'profiles',   'View profiles',         'See profiles in this workspace.'),
  ('profiles.create',        'profiles',   'Create profiles',       'Add new browser profiles.'),
  ('profiles.edit',          'profiles',   'Edit profiles',         'Change profile name, fingerprint, proxy, tags, notes.'),
  ('profiles.delete',        'profiles',   'Delete profiles',       'Permanently delete profiles. Releases proxies.'),
  ('profiles.launch',        'profiles',   'Launch profiles',       'Open a Chromium window for any profile they can see.'),
  ('profiles.force_unlock',  'profiles',   'Force-unlock profiles', 'Override Safeguard A and evict another user holding the profile lock.'),
  -- Groups (folders for profiles)
  ('groups.view',            'groups',     'View groups',           'See groups in the sidebar/filters.'),
  ('groups.create',          'groups',     'Create groups',         'Add new groups.'),
  ('groups.edit',            'groups',     'Edit groups',           'Rename groups, change colour.'),
  ('groups.delete',          'groups',     'Delete groups',         'Delete groups (profiles fall back to ungrouped).'),
  -- Tags
  ('tags.create',            'tags',       'Create tags',           'Add new tags to profiles.'),
  ('tags.edit',              'tags',       'Edit tags',             'Rename or reassign tags across profiles.'),
  ('tags.delete',            'tags',       'Delete tags',           'Remove tags from the workspace.'),
  -- Bulk
  ('bulk.create_profiles',   'bulk',       'Bulk create profiles',  'Create many profiles at once.'),
  ('bulk.edit_profiles',     'bulk',       'Bulk edit profiles',    'Edit many profiles at once.'),
  ('bulk.delete_profiles',   'bulk',       'Bulk delete profiles',  'Delete many profiles at once.'),
  -- Workspace
  ('workspace.view_settings','workspace',  'View workspace settings','See workspace settings page.'),
  ('workspace.edit_settings','workspace',  'Edit workspace settings','Change name, defaults, safeguard toggles.'),
  ('workspace.delete',       'workspace',  'Delete workspace',      'Delete the entire workspace. Cannot be undone.'),
  -- Billing
  ('billing.view',           'billing',    'View billing',          'See plan, usage, invoices.'),
  ('billing.manage',         'billing',    'Manage billing',        'Change plan, payment method, cancel.'),
  -- Members
  ('members.view',           'members',    'View members',          'See the list of workspace members.'),
  ('members.invite',         'members',    'Invite members',        'Invite users to this workspace.'),
  ('members.remove',         'members',    'Remove members',        'Remove users from this workspace.'),
  ('members.assign_role',    'members',    'Assign roles',          'Change which role a member has.'),
  -- Roles
  ('roles.view',             'roles',      'View roles',            'See the list of roles and their permissions.'),
  ('roles.create',           'roles',      'Create roles',          'Define new custom roles in this workspace.'),
  ('roles.edit',             'roles',      'Edit roles',            'Rename roles, change which permissions they grant.'),
  ('roles.delete',           'roles',      'Delete roles',          'Delete custom roles (defaults are protected).'),
  -- Extensions
  ('extensions.create',      'extensions', 'Add extensions',        'Add Chrome extensions to the workspace.'),
  ('extensions.edit',        'extensions', 'Edit extensions',       'Update extension metadata, auto-install defaults.'),
  ('extensions.delete',      'extensions', 'Delete extensions',     'Remove extensions from the workspace.'),
  -- Activity
  ('activity.view',          'activity',   'View activity log',     'See the audit trail of who did what.');

-- ===================================================================
-- 2. Roles (workspace-scoped, with hierarchy + protection)
-- ===================================================================
create table app_roles (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces on delete cascade,
  name                text not null,
  description         text,
  color               text default '#6366f1',
  hierarchy           int  not null default 100,           -- lower = more powerful (Owner=0)
  is_protected        boolean not null default false,      -- can't change permission grants
  is_delete_protected boolean not null default false,      -- can't delete the role
  is_default          boolean not null default false,      -- one of the 4 seeded defaults
  created_at          timestamptz default now(),
  unique (workspace_id, name)
);

create index idx_app_roles_workspace on app_roles (workspace_id);
create index idx_app_roles_workspace_hierarchy on app_roles (workspace_id, hierarchy);

-- ===================================================================
-- 3. role_permissions + user_roles
-- ===================================================================
create table role_permissions (
  role_id        uuid not null references app_roles on delete cascade,
  permission_key text not null references app_permissions on delete restrict,
  workspace_id   uuid not null references workspaces on delete cascade,  -- denormalised for fast workspace-filtered lookups
  primary key (role_id, permission_key)
);

create index idx_role_permissions_role on role_permissions (role_id);
create index idx_role_permissions_workspace on role_permissions (workspace_id, permission_key);

create table user_roles (
  user_id      uuid not null references auth.users on delete cascade,
  role_id      uuid not null references app_roles on delete cascade,
  workspace_id uuid not null references workspaces on delete cascade,
  assigned_at  timestamptz default now(),
  assigned_by  uuid,  -- FK added below with on delete set null
  unique (user_id, workspace_id)
);

alter table user_roles
  add constraint user_roles_assigned_by_fkey
  foreign key (assigned_by) references auth.users(id) on delete set null;

create index idx_user_roles_user_workspace on user_roles (user_id, workspace_id);
create index idx_user_roles_role on user_roles (role_id);

-- ===================================================================
-- 4. Drop the legacy workspace_members.role enum
-- ===================================================================
alter table workspace_members drop column role;
drop index if exists workspace_members_one_owner;

-- ===================================================================
-- 5. Plans + plan_features — single source of truth for tiers
-- ===================================================================
-- Each plan_key matches workspaces.plan ('free' | 'pro' | 'team').
-- Each row in plan_features says: "this plan can use this feature."
-- Absence of a row = feature disabled for that plan.
-- Numeric limits (profile cap, seat cap, log retention) are stored
-- separately in the plans table — different shape than boolean features.
create table plans (
  plan_key             text primary key,
  display_name         text not null,
  profile_limit        int  not null,
  member_seat_limit    int  not null,
  activity_log_days    int,                       -- nullable = unlimited retention
  monthly_price_usd    int                        -- nullable; reference only, real billing in Stripe
);

insert into plans (plan_key, display_name, profile_limit, member_seat_limit, activity_log_days, monthly_price_usd) values
  ('free', 'Free', 5,    1,  7,    0),
  ('pro',  'Pro',  100,  5,  90,   null),        -- price set when Stripe wires up
  ('team', 'Team', 1000, 25, null, null);        -- null = unlimited days

create table plan_features (
  plan_key    text not null references plans on delete cascade,
  feature_key text not null,
  primary key (plan_key, feature_key)
);

-- Feature keys: any string; used by check_plan_feature() and gating policies.
-- Categories: 'bulk', 'extensions', 'tubeproxies_api', 'custom_roles',
--             'force_unlock', 'realtime_sync'.
insert into plan_features (plan_key, feature_key) values
  -- Free: just the basics
  ('free', 'realtime_sync'),
  -- Pro: most features
  ('pro',  'realtime_sync'),
  ('pro',  'bulk'),
  ('pro',  'extensions'),
  ('pro',  'tubeproxies_api'),
  ('pro',  'force_unlock'),
  -- Team: everything Pro has plus custom roles
  ('team', 'realtime_sync'),
  ('team', 'bulk'),
  ('team', 'extensions'),
  ('team', 'tubeproxies_api'),
  ('team', 'force_unlock'),
  ('team', 'custom_roles');

-- ===================================================================
-- 6. The ONE permission-check function (RBAC)
-- ===================================================================
create or replace function check_user_permission(
  p_user_id uuid,
  p_permission_key text,
  p_workspace_id uuid
)
returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = p_user_id
      and ur.workspace_id = p_workspace_id
      and rp.permission_key = p_permission_key
  )
$$;
grant execute on function check_user_permission(uuid, text, uuid) to authenticated;

-- ===================================================================
-- 7. The ONE plan-feature-check function
-- ===================================================================
-- Lets RLS policies say "this action requires the workspace's plan to
-- include feature X." Caller passes the workspace_id; we look up its
-- plan and check plan_features. The check is plan-scoped to the
-- workspace's owner — exactly matching the user's spec.
create or replace function check_plan_feature(
  p_workspace_id uuid,
  p_feature_key text
)
returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.workspaces w
    join public.plan_features pf on pf.plan_key = w.plan
    where w.id = p_workspace_id
      and pf.feature_key = p_feature_key
  )
$$;
grant execute on function check_plan_feature(uuid, text) to authenticated;

-- ===================================================================
-- 8. seed_default_roles() — runs per workspace on creation
-- ===================================================================
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
    (p_workspace_id, 'Manager',  100, false, false, true, '#F59E0B', 'Manages profiles, members, groups, and extensions.'),
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

  -- Operator
  insert into public.role_permissions (role_id, workspace_id, permission_key) values
    (v_operator_id, p_workspace_id, 'profiles.view'),
    (v_operator_id, p_workspace_id, 'profiles.create'),
    (v_operator_id, p_workspace_id, 'profiles.edit'),
    (v_operator_id, p_workspace_id, 'profiles.launch'),
    (v_operator_id, p_workspace_id, 'tags.create'),
    (v_operator_id, p_workspace_id, 'groups.view');

  -- Viewer
  insert into public.role_permissions (role_id, workspace_id, permission_key) values
    (v_viewer_id, p_workspace_id, 'profiles.view'),
    (v_viewer_id, p_workspace_id, 'profiles.launch'),
    (v_viewer_id, p_workspace_id, 'groups.view');

  -- Assign workspace creator as Owner
  insert into public.user_roles (user_id, role_id, workspace_id, assigned_by)
  values (p_owner_user_id, v_owner_id, p_workspace_id, p_owner_user_id);
end;
$$;
grant execute on function seed_default_roles(uuid, uuid) to authenticated;

-- ===================================================================
-- 9. Updated workspace creation paths
-- ===================================================================

-- 9a. Helper: workspaces the caller belongs to (used by SELECT policies)
create or replace function user_workspace_ids()
returns setof uuid
language sql security definer stable set search_path = '' as $$
  select workspace_id from public.workspace_members where user_id = auth.uid()
$$;
grant execute on function user_workspace_ids() to authenticated;

-- 9b. Helper: caller's permissions in a workspace (for renderer prefetch)
create or replace function my_permissions(p_workspace_id uuid)
returns setof text
language sql security definer stable set search_path = '' as $$
  select rp.permission_key
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  where ur.user_id = auth.uid()
    and ur.workspace_id = p_workspace_id
$$;
grant execute on function my_permissions(uuid) to authenticated;

-- 9c. Helper: caller's role name (display only)
create or replace function my_role_name(p_workspace_id uuid)
returns text
language sql security definer stable set search_path = '' as $$
  select r.name
  from public.user_roles ur
  join public.app_roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
    and ur.workspace_id = p_workspace_id
  limit 1
$$;
grant execute on function my_role_name(uuid) to authenticated;

-- 9d. Replacement create_workspace() RPC
create or replace function create_workspace(p_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text;
  v_ws_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Soft model: a user can OWN at most one workspace. They can still be
  -- a Member (Manager/Operator/Viewer) of others.
  if exists (select 1 from public.workspaces where owner_id = v_uid) then
    raise exception 'You already own a workspace. Each user can only own one.'
      using errcode = '23505';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), 'My Workspace');
  if length(v_name) > 80 then
    v_name := left(v_name, 80);
  end if;

  insert into public.workspaces (name, owner_id) values (v_name, v_uid) returning id into v_ws_id;
  insert into public.workspace_members (workspace_id, user_id) values (v_ws_id, v_uid);
  perform public.seed_default_roles(v_ws_id, v_uid);

  return v_ws_id;
end;
$$;
grant execute on function create_workspace(text) to authenticated;

-- 9e. Updated handle_new_user trigger
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ws_id   uuid;
  v_ws_name text;
begin
  v_ws_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'workspace_name'), ''),
    'My Workspace'
  );
  if length(v_ws_name) > 80 then
    v_ws_name := left(v_ws_name, 80);
  end if;

  insert into public.workspaces (name, owner_id) values (v_ws_name, new.id) returning id into v_ws_id;
  insert into public.workspace_members (workspace_id, user_id) values (v_ws_id, new.id);
  perform public.seed_default_roles(v_ws_id, new.id);
  return new;
end;
$$;

-- ===================================================================
-- 10. Drop legacy policies + recreate using check_user_permission
-- ===================================================================
drop policy if exists "members read members"      on workspace_members;
drop policy if exists "admins manage members"     on workspace_members;
drop policy if exists "members read groups"       on groups;
drop policy if exists "managers manage groups"    on groups;
drop policy if exists "members read profiles"     on profiles;
drop policy if exists "managers write profiles"   on profiles;
drop policy if exists "members read extensions"   on extensions;
drop policy if exists "managers manage extensions" on extensions;
drop policy if exists "members read activity"     on activity_log;
drop policy if exists "members write activity"    on activity_log;
drop policy if exists "owners update workspaces"  on workspaces;
drop policy if exists "users create workspaces"   on workspaces;

-- Drop the now-orphan helper from 0001
drop function if exists user_workspace_role(uuid);

-- ===================================================================
-- workspaces
-- ===================================================================
create policy "users create workspaces" on workspaces for insert
  with check (owner_id = (select auth.uid()));
create policy "workspace.edit_settings" on workspaces for update
  using (check_user_permission((select auth.uid()), 'workspace.edit_settings', id))
  with check (check_user_permission((select auth.uid()), 'workspace.edit_settings', id));
create policy "workspace.delete" on workspaces for delete
  using (check_user_permission((select auth.uid()), 'workspace.delete', id));

-- ===================================================================
-- workspace_members
-- ===================================================================
create policy "members can see members of their workspaces"
  on workspace_members for select
  using (
    exists (
      select 1 from public.workspace_members m2
      where m2.workspace_id = workspace_members.workspace_id
        and m2.user_id = (select auth.uid())
    )
  );
create policy "members.invite" on workspace_members for insert
  with check (check_user_permission((select auth.uid()), 'members.invite', workspace_id));
create policy "members.remove" on workspace_members for delete
  using (check_user_permission((select auth.uid()), 'members.remove', workspace_id));

-- ===================================================================
-- groups
-- ===================================================================
create policy "groups.view" on groups for select
  using (check_user_permission((select auth.uid()), 'groups.view', workspace_id));
create policy "groups.create" on groups for insert
  with check (check_user_permission((select auth.uid()), 'groups.create', workspace_id));
create policy "groups.edit" on groups for update
  using (check_user_permission((select auth.uid()), 'groups.edit', workspace_id))
  with check (check_user_permission((select auth.uid()), 'groups.edit', workspace_id));
create policy "groups.delete" on groups for delete
  using (check_user_permission((select auth.uid()), 'groups.delete', workspace_id));

-- ===================================================================
-- profiles  (NOTE: bulk insert path is plan-gated — see section 11)
-- ===================================================================
create policy "profiles.view" on profiles for select
  using (check_user_permission((select auth.uid()), 'profiles.view', workspace_id));
create policy "profiles.create" on profiles for insert
  with check (check_user_permission((select auth.uid()), 'profiles.create', workspace_id));
create policy "profiles.edit" on profiles for update
  using (check_user_permission((select auth.uid()), 'profiles.edit', workspace_id))
  with check (check_user_permission((select auth.uid()), 'profiles.edit', workspace_id));
create policy "profiles.delete" on profiles for delete
  using (check_user_permission((select auth.uid()), 'profiles.delete', workspace_id));

-- ===================================================================
-- extensions  — plan-gated: requires the workspace's plan to include 'extensions'
-- ===================================================================
create policy "extensions read for profile-viewers" on extensions for select
  using (check_user_permission((select auth.uid()), 'profiles.view', workspace_id));
create policy "extensions.create plan-gated" on extensions for insert
  with check (
    check_user_permission((select auth.uid()), 'extensions.create', workspace_id)
    and check_plan_feature(workspace_id, 'extensions')
  );
create policy "extensions.edit plan-gated" on extensions for update
  using (
    check_user_permission((select auth.uid()), 'extensions.edit', workspace_id)
    and check_plan_feature(workspace_id, 'extensions')
  )
  with check (
    check_user_permission((select auth.uid()), 'extensions.edit', workspace_id)
    and check_plan_feature(workspace_id, 'extensions')
  );
create policy "extensions.delete" on extensions for delete
  using (check_user_permission((select auth.uid()), 'extensions.delete', workspace_id));

-- ===================================================================
-- activity_log  — append-only at the policy layer (no UPDATE/DELETE policies)
-- ===================================================================
create policy "activity.view" on activity_log for select
  using (check_user_permission((select auth.uid()), 'activity.view', workspace_id));
create policy "members write own activity" on activity_log for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = activity_log.workspace_id
        and m.user_id = (select auth.uid())
    )
  );

-- ===================================================================
-- 11. Plan-gated bulk operations
-- ===================================================================
-- The "bulk.create_profiles" permission alone isn't enough — the
-- workspace's plan must include the 'bulk' feature. Free plan won't
-- include 'bulk' so even an Owner on Free plan can't do bulk creates.
--
-- Implementation: a SECURITY DEFINER RPC create_profiles_bulk() that
-- callers must use for batch creation. The function checks both
-- check_user_permission AND check_plan_feature before inserting.
-- (We can't enforce "this is a bulk insert" via RLS alone, so the
-- requirement is procedural: bulk paths go through the RPC.)
create or replace function create_profiles_bulk(
  p_workspace_id uuid,
  p_profiles jsonb       -- array of {name, fingerprint_seed?, group_id?, tags?, notes?}
)
returns setof profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_seed bigint;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.check_user_permission(v_uid, 'bulk.create_profiles', p_workspace_id) then
    raise exception 'bulk.create_profiles permission required' using errcode = '42501';
  end if;
  if not public.check_plan_feature(p_workspace_id, 'bulk') then
    raise exception 'Bulk operations require the Pro or Team plan.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_profiles) > 500 then
    raise exception 'Bulk insert capped at 500 profiles per call.' using errcode = 'P0001';
  end if;

  for v_row in select * from jsonb_array_elements(p_profiles) loop
    v_seed := coalesce((v_row->>'fingerprint_seed')::bigint, floor(random() * 2147483647)::bigint);
    return query
      insert into public.profiles (workspace_id, name, fingerprint_seed, group_id, tags, notes, created_by)
      values (
        p_workspace_id,
        coalesce(v_row->>'name', 'Untitled'),
        v_seed,
        nullif(v_row->>'group_id', '')::uuid,
        coalesce((v_row->'tags')::jsonb, '[]'::jsonb)::text[],
        v_row->>'notes',
        v_uid
      )
      returning *;
  end loop;
end;
$$;
grant execute on function create_profiles_bulk(uuid, jsonb) to authenticated;

-- ===================================================================
-- 12. Billing-column write protection
-- ===================================================================
-- A Manager has workspace.edit_settings, which lets them UPDATE workspaces.
-- Without this trigger, they could change `plan` to 'team' and bypass billing.
-- service_role (Stripe webhook) bypasses RLS but NOT triggers — we let it
-- through explicitly.
create or replace function block_billing_column_updates()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (auth.role() = 'service_role') then
    return new;
  end if;
  if old.plan is distinct from new.plan then
    raise exception 'plan can only be changed by billing webhook' using errcode = '42501';
  end if;
  if old.stripe_customer_id is distinct from new.stripe_customer_id then
    raise exception 'stripe_customer_id is read-only' using errcode = '42501';
  end if;
  if old.stripe_subscription_id is distinct from new.stripe_subscription_id then
    raise exception 'stripe_subscription_id is read-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_block_billing_updates on workspaces;
create trigger workspaces_block_billing_updates
  before update on workspaces
  for each row execute function block_billing_column_updates();

-- ===================================================================
-- 13. Role hierarchy guard + delete protection
-- ===================================================================
-- Even though our policies say is_protected = false / is_delete_protected = false,
-- defense in depth: triggers also block.
create or replace function block_protected_role_delete()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.is_delete_protected then
    raise exception 'Role "%" is delete-protected.', old.name using errcode = '42501';
  end if;
  return old;
end;
$$;
drop trigger if exists app_roles_block_protected_delete on app_roles;
create trigger app_roles_block_protected_delete
  before delete on app_roles
  for each row execute function block_protected_role_delete();

create or replace function block_protection_flag_unflip()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.is_default and (
    (old.is_protected and not new.is_protected)
    or (old.is_delete_protected and not new.is_delete_protected)
  ) then
    raise exception 'Cannot remove protection flags from default role "%".', old.name
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists app_roles_block_protection_unflip on app_roles;
create trigger app_roles_block_protection_unflip
  before update on app_roles
  for each row execute function block_protection_flag_unflip();

-- Hierarchy guard: caller's effective hierarchy must be <= target's
create or replace function can_user_modify_role(p_user_id uuid, p_target_role_id uuid)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_min_hierarchy int;
  v_target_hierarchy   int;
  v_target_workspace   uuid;
begin
  select hierarchy, workspace_id into v_target_hierarchy, v_target_workspace
    from public.app_roles where id = p_target_role_id;
  if v_target_hierarchy is null then return false; end if;

  select min(ar.hierarchy) into v_user_min_hierarchy
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
   where ur.user_id = p_user_id and ur.workspace_id = v_target_workspace;

  return v_user_min_hierarchy is not null and v_user_min_hierarchy <= v_target_hierarchy;
end;
$$;
grant execute on function can_user_modify_role(uuid, uuid) to authenticated;

-- ===================================================================
-- app_permissions / app_roles / role_permissions / user_roles policies
-- ===================================================================
alter table app_permissions enable row level security;
alter table app_roles enable row level security;
alter table role_permissions enable row level security;
alter table user_roles enable row level security;
alter table plans enable row level security;
alter table plan_features enable row level security;

-- Permission catalogue: visible to any signed-in user (needed for role-editor UI)
create policy "app_permissions visible to signed-in users"
  on app_permissions for select to authenticated
  using ((select auth.uid()) is not null);

-- Plans + features catalogues: visible to any signed-in user (needed to render plan UI)
create policy "plans visible to signed-in users"
  on plans for select to authenticated
  using ((select auth.uid()) is not null);
create policy "plan_features visible to signed-in users"
  on plan_features for select to authenticated
  using ((select auth.uid()) is not null);

-- app_roles
create policy "roles.view" on app_roles for select
  using (check_user_permission((select auth.uid()), 'roles.view', workspace_id));
create policy "roles.create plan-gated" on app_roles for insert
  with check (
    check_user_permission((select auth.uid()), 'roles.create', workspace_id)
    and check_plan_feature(workspace_id, 'custom_roles')
    and is_protected = false
    and is_default = false
  );
create policy "roles.edit" on app_roles for update
  using (
    check_user_permission((select auth.uid()), 'roles.edit', workspace_id)
    and is_protected = false
    and can_user_modify_role((select auth.uid()), id)
  )
  with check (
    check_user_permission((select auth.uid()), 'roles.edit', workspace_id)
    and is_protected = false
    and can_user_modify_role((select auth.uid()), id)
  );
create policy "roles.delete" on app_roles for delete
  using (
    check_user_permission((select auth.uid()), 'roles.delete', workspace_id)
    and is_protected = false
    and is_delete_protected = false
    and is_default = false
    and can_user_modify_role((select auth.uid()), id)
  );

-- role_permissions
create policy "role_permissions readable with roles.view"
  on role_permissions for select
  using (check_user_permission((select auth.uid()), 'roles.view', workspace_id));
create policy "role_permissions insert"
  on role_permissions for insert
  with check (
    check_user_permission((select auth.uid()), 'roles.edit', workspace_id)
    and exists (
      select 1 from public.app_roles r
      where r.id = role_permissions.role_id and r.is_protected = false
    )
  );
create policy "role_permissions delete"
  on role_permissions for delete
  using (
    check_user_permission((select auth.uid()), 'roles.edit', workspace_id)
    and exists (
      select 1 from public.app_roles r
      where r.id = role_permissions.role_id and r.is_protected = false
    )
  );

-- user_roles
create policy "user_roles read own or via members.view"
  on user_roles for select
  using (
    user_id = (select auth.uid())
    or check_user_permission((select auth.uid()), 'members.view', workspace_id)
  );
create policy "user_roles insert via members.assign_role" on user_roles for insert
  with check (check_user_permission((select auth.uid()), 'members.assign_role', workspace_id));
create policy "user_roles update via members.assign_role" on user_roles for update
  using (check_user_permission((select auth.uid()), 'members.assign_role', workspace_id))
  with check (check_user_permission((select auth.uid()), 'members.assign_role', workspace_id));
create policy "user_roles delete via members.assign_role" on user_roles for delete
  using (check_user_permission((select auth.uid()), 'members.assign_role', workspace_id));

-- ===================================================================
-- 14. ON DELETE SET NULL on every audit-trail user FK
-- ===================================================================
-- Audit trail must survive user deletion. Default behaviour was NO ACTION
-- (delete fails) — we change to SET NULL so historical rows persist with
-- "Deleted user" attribution.
alter table workspace_members
  drop constraint if exists workspace_members_invited_by_fkey,
  add constraint workspace_members_invited_by_fkey
    foreign key (invited_by) references auth.users(id) on delete set null;

alter table profiles
  drop constraint if exists profiles_assigned_to_fkey,
  add constraint profiles_assigned_to_fkey
    foreign key (assigned_to) references auth.users(id) on delete set null;
alter table profiles
  drop constraint if exists profiles_created_by_fkey,
  add constraint profiles_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
alter table profiles
  drop constraint if exists profiles_last_opened_by_fkey,
  add constraint profiles_last_opened_by_fkey
    foreign key (last_opened_by) references auth.users(id) on delete set null;
alter table profiles
  drop constraint if exists profiles_open_by_user_id_fkey,
  add constraint profiles_open_by_user_id_fkey
    foreign key (open_by_user_id) references auth.users(id) on delete set null;

-- THE CRITICAL ONE: activity_log.user_id
alter table activity_log
  drop constraint if exists activity_log_user_id_fkey,
  add constraint activity_log_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

-- Workspaces.owner_id intentionally NOT changed: a workspace cannot
-- exist without an owner; transfer ownership before deleting the user.

-- ===================================================================
-- 15. One-workspace-as-owner constraint (Soft model)
-- ===================================================================
-- A user can OWN at most one workspace. They can be a Member of others.
-- Enforced by a unique partial index AND by the create_workspace() RPC's
-- explicit check (defense in depth).
create unique index if not exists workspaces_one_per_owner
  on workspaces (owner_id);

-- ===================================================================
-- 16. Update force_release_profile_lock — uses permission + plan feature
-- ===================================================================
create or replace function force_release_profile_lock(p_profile_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.profiles where id = p_profile_id;
  if v_workspace_id is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if not public.check_user_permission(auth.uid(), 'profiles.force_unlock', v_workspace_id) then
    raise exception 'profiles.force_unlock permission required' using errcode = '42501';
  end if;
  if not public.check_plan_feature(v_workspace_id, 'force_unlock') then
    raise exception 'Force-unlock requires the Pro or Team plan.' using errcode = 'P0001';
  end if;
  update public.profiles
     set open_session_id = null, open_by_user_id = null,
         open_by_device  = null, open_at = null, open_heartbeat_at = null
   where id = p_profile_id;
  insert into public.activity_log (workspace_id, user_id, profile_id, action, metadata)
  values (v_workspace_id, auth.uid(), p_profile_id, 'force_unlocked',
          jsonb_build_object('forced_by', auth.uid()));
  return true;
end;
$$;
grant execute on function force_release_profile_lock(uuid) to authenticated;

-- ===================================================================
-- 17. Indexes on RLS-checked columns
-- ===================================================================
create index if not exists idx_workspaces_owner on workspaces(owner_id);
create index if not exists idx_groups_workspace on groups(workspace_id);

-- ===================================================================
-- 18. Plan-aware seat limit (re-derive from plans table)
-- ===================================================================
-- The 0001 migration hardcoded the limits inside the trigger functions.
-- Replace them with versions that read from the plans table — single
-- source of truth.
create or replace function enforce_profile_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan  text;
  v_count int;
  v_limit int;
begin
  select plan into v_plan from public.workspaces where id = new.workspace_id;
  select profile_limit into v_limit from public.plans where plan_key = v_plan;
  if v_limit is null then
    raise exception 'Unknown plan: %', v_plan using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.profiles where workspace_id = new.workspace_id;
  if v_count >= v_limit then
    raise exception 'Plan limit reached: % of %', v_count, v_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function enforce_member_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan  text;
  v_count int;
  v_limit int;
begin
  select plan into v_plan from public.workspaces where id = new.workspace_id;
  select member_seat_limit into v_limit from public.plans where plan_key = v_plan;
  if v_limit is null then
    raise exception 'Unknown plan: %', v_plan using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.workspace_members where workspace_id = new.workspace_id;
  if v_count >= v_limit then
    raise exception 'Member seat limit reached: % of %', v_count, v_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
