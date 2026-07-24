-- ===================================================================
-- 0017_roles_access_catalog.sql
-- Broaden the permission catalogue to back the "Roles & access" page.
--
-- The redesigned Roles page renders a wider catalogue than the original
-- app_permissions set (2FA authenticator, stored account logins, cookie
-- import/export, automations, synchronizer, API/MCP, and several finer
-- workspace toggles). Those UI rows had no backing permission_key, so
-- flipping them did nothing to real RBAC.
--
-- This migration makes every catalogue row a REAL permission key so the
-- page's toggles/levels persist to role_permissions and are checked by
-- check_user_permission() exactly like every other permission.
--
-- Some new keys (accounts.*, twofa.*, cookies.*, automations.*,
-- synchronizer.run, api.manage) have no table/RLS policy yet — the
-- authenticator / accounts / automations features aren't built. That is
-- intentional and consistent with CLAUDE.md: permissions are the API.
-- When those features land, their RLS policies call check_user_permission
-- with these keys and the grants set here already apply. Keys with an
-- existing table (profiles.*, proxies.*, workspace.*, extensions.*) are
-- enforced by policies today (existing + the two added in section 3).
--
-- Idempotent: on-conflict guards everywhere; safe to re-run.
-- ===================================================================

-- ── 1. New permission catalogue rows ───────────────────────────────────────
insert into public.app_permissions (permission_key, category, label, description) values
  -- Profiles (finer-grained level ladders)
  ('profiles.assign_member',  'profiles',      'Assign profiles to members',  'Reassign profiles between members.'),
  ('profiles.edit_fingerprint','profiles',     'Edit fingerprints',           'Modify OS, WebGL, canvas, and hardware fingerprints.'),
  -- Accounts & cookies
  ('accounts.view',           'accounts',      'View account logins',         'See stored account credentials for assigned profiles.'),
  ('accounts.autofill',       'accounts',      'Autofill account logins',     'Autofill stored account credentials into pages.'),
  ('accounts.manage',         'accounts',      'Manage account logins',       'Add, edit, and remove stored account credentials.'),
  ('cookies.import',          'accounts',      'Import cookies',              'Load cookies & sessions into a profile.'),
  ('cookies.export',          'accounts',      'Export cookies & sessions',   'Download stored login state out of a profile.'),
  -- Authenticator (2FA)
  ('twofa.view',              'authenticator', 'View 2FA codes',              'View live 2FA codes for assigned accounts.'),
  ('twofa.generate',          'authenticator', 'Copy 2FA codes',              'Copy live 2FA codes for assigned accounts.'),
  ('twofa.manage_tokens',     'authenticator', 'Add & remove 2FA tokens',     'Enroll new accounts or delete authenticator tokens.'),
  ('twofa.reveal_seed',       'authenticator', 'Reveal 2FA setup keys',       'See the raw TOTP secret behind a token.'),
  ('twofa.export',            'authenticator', 'Export 2FA tokens',           'Migrate or download seeds out of the workspace.'),
  -- Proxies
  ('proxies.view_credentials','proxies',       'View proxy credentials',      'See full IP, port, username, and password.'),
  -- Automation
  ('automations.view',        'automation',    'View automations',            'See no-code flows inside profiles.'),
  ('automations.edit',        'automation',    'Edit automations',            'Build and edit no-code flows inside profiles.'),
  ('automations.run',         'automation',    'Run automations',             'Run no-code flows inside profiles.'),
  ('synchronizer.run',        'automation',    'Run synchronizer',            'Run synchronized multi-profile sessions.'),
  ('api.manage',              'automation',    'API & AI MCP',                'Generate API keys and connect AI agents.'),
  -- Workspace
  ('workspace.export_data',   'workspace',     'Export workspace data',       'Bulk export profiles, cookies, and proxies.')
on conflict (permission_key) do nothing;

-- ── 2. Backfill grants into the default roles of existing workspaces ────────
-- Grants mirror the §3 role defaults of the Roles & access design. New
-- workspaces get the same via the updated seed_default_roles() (section 4).
do $$
declare
  v_ws uuid;
  v_owner uuid; v_admin uuid; v_editor uuid; v_uploader uuid; v_viewer uuid;
begin
  for v_ws in select id from public.workspaces loop
    select id into v_owner    from public.app_roles where workspace_id = v_ws and name = 'Owner';
    select id into v_admin    from public.app_roles where workspace_id = v_ws and name = 'Admin';
    select id into v_editor   from public.app_roles where workspace_id = v_ws and name = 'Editor';
    select id into v_uploader from public.app_roles where workspace_id = v_ws and name = 'Uploader';
    select id into v_viewer   from public.app_roles where workspace_id = v_ws and name = 'Viewer';

    -- Owner: every permission (including the new ones).
    if v_owner is not null then
      insert into public.role_permissions (role_id, workspace_id, permission_key)
      select v_owner, v_ws, permission_key from public.app_permissions
      on conflict do nothing;
    end if;

    -- Admin: broad access, but stop short of destructive/workspace-danger.
    -- Everything new except the raw-secret / bulk-export danger toggles.
    if v_admin is not null then
      insert into public.role_permissions (role_id, workspace_id, permission_key)
      select v_admin, v_ws, permission_key from public.app_permissions
      where permission_key not in (
        'twofa.reveal_seed', 'twofa.export',
        'workspace.export_data'
      )
        and permission_key not in (
          'workspace.delete', 'billing.view', 'billing.manage',
          'roles.create', 'roles.edit', 'roles.delete'
        )
      on conflict do nothing;
    end if;

    -- Editor: matches §3 Editor defaults exactly.
    if v_editor is not null then
      insert into public.role_permissions (role_id, workspace_id, permission_key)
      select v_editor, v_ws, k from unnest(array[
        -- browser_profiles: write  → view+launch+create+edit
        'profiles.view', 'profiles.launch', 'profiles.create', 'profiles.edit',
        -- profile_assignment: none  → (nothing)
        -- fingerprint_editing: read → edit_fingerprint NOT granted (read = view only)
        -- delete_profiles: false; bulk_actions: true
        'bulk.create_profiles', 'bulk.edit_profiles', 'bulk.delete_profiles',
        -- account_logins: read
        'accounts.view',
        -- import_cookies: true; export_cookies: false
        'cookies.import',
        -- generate_2fa_codes: write → view+generate ; add_remove_tokens: true
        'twofa.view', 'twofa.generate', 'twofa.manage_tokens',
        -- proxy_pool: read ; add_remove_proxies: none
        'proxies.view',
        -- view_proxy_credentials: true ; test_proxies: true
        'proxies.view_credentials', 'proxies.test',
        -- automations: write → view+edit ; synchronizer: true
        'automations.view', 'automations.edit', 'synchronizer.run',
        -- extensions: read → view (profiles.view already granted)
        -- activity_audit_log: true
        'activity.view',
        -- groups visibility (day-to-day work)
        'groups.view', 'tags.create'
      ]) as k
      on conflict do nothing;
    end if;

    -- Uploader: narrow — load profiles/cookies and run them.
    if v_uploader is not null then
      insert into public.role_permissions (role_id, workspace_id, permission_key)
      select v_uploader, v_ws, k from unnest(array[
        'profiles.view', 'profiles.launch', 'profiles.create',
        'bulk.create_profiles',
        'accounts.view',
        'cookies.import',
        'twofa.view',
        'proxies.view', 'proxies.test',
        'automations.view', 'automations.run', 'synchronizer.run',
        'groups.view'
      ]) as k
      on conflict do nothing;
    end if;

    -- Viewer: read-only. Levels = read where meaningful, toggles = false.
    if v_viewer is not null then
      insert into public.role_permissions (role_id, workspace_id, permission_key)
      select v_viewer, v_ws, k from unnest(array[
        'profiles.view',
        'accounts.view',
        'twofa.view',
        'proxies.view',
        'automations.view'
      ]) as k
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- ── 3. RLS policies for the new profile-scoped keys that DO have a table ────
-- profiles.assign_member: reassigning a profile's owning member is an UPDATE
-- of profiles.assigned_to. The existing profiles.edit policy already gates
-- generic edits; add a distinct policy so assignment can be granted
-- independently of full edit (Editor gets edit but not assign per §3).
-- We keep it simple: assignment rides the same UPDATE command, so grant it
-- via an additional permissive policy. (profiles.edit_fingerprint is
-- enforced in the fingerprint-edit code path + this same UPDATE surface.)
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'profiles') then
    -- Additive OR-ed policy: a user may UPDATE a profile row if they hold
    -- profiles.edit OR profiles.assign_member OR profiles.edit_fingerprint.
    -- (Postgres OR-combines multiple permissive policies for the same cmd.)
    drop policy if exists "profiles.assign_member" on public.profiles;
    create policy "profiles.assign_member" on public.profiles for update
      using (public.check_user_permission((select auth.uid()), 'profiles.assign_member', workspace_id))
      with check (public.check_user_permission((select auth.uid()), 'profiles.assign_member', workspace_id));

    drop policy if exists "profiles.edit_fingerprint" on public.profiles;
    create policy "profiles.edit_fingerprint" on public.profiles for update
      using (public.check_user_permission((select auth.uid()), 'profiles.edit_fingerprint', workspace_id))
      with check (public.check_user_permission((select auth.uid()), 'profiles.edit_fingerprint', workspace_id));
  end if;
end $$;

-- ── 4. Rewrite seed_default_roles() so NEW workspaces get the new grants ────
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
  insert into public.role_permissions (role_id, workspace_id, permission_key)
  select v_admin_id, p_workspace_id, permission_key
  from public.app_permissions
  where permission_key not in (
    'workspace.delete', 'billing.view', 'billing.manage',
    'roles.create', 'roles.edit', 'roles.delete',
    'twofa.reveal_seed', 'twofa.export', 'workspace.export_data'
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

notify pgrst, 'reload schema';
