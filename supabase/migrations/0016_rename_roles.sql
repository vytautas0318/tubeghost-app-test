-- ===================================================================
-- 0016_rename_roles.sql
-- Rename the default role set to match the Members UI redesign:
--   Manager  → Admin
--   Operator → Editor
--   (new)      Uploader   — profile create/launch + bulk, upload-focused
--   Owner / Viewer unchanged
--
-- Strategy for EXISTING workspaces: rename in place (update app_roles.name)
-- so role IDs are preserved — every user_roles + role_permissions row keeps
-- pointing at the same role. Then insert a Uploader role wherever it's
-- missing, with its permission grants. New workspaces get the new set from
-- the updated seed_default_roles().
--
-- Idempotent: safe to re-run. Role names are workspace config, not the
-- permission API (CLAUDE.md), so renaming does not touch RLS.
-- ===================================================================

-- ── 1. Rename existing default roles in place ──────────────────────────────
-- Only touch rows that still carry the OLD default names and colors, so we
-- don't stomp on any custom roles a workspace may have created.
update public.app_roles
  set name = 'Admin',
      color = coalesce(color, '#8B5CF6'),
      description = 'Manages profiles, members, groups, and extensions.'
  where name = 'Manager' and is_default = true;

update public.app_roles
  set name = 'Editor',
      description = 'Create, edit, and launch profiles day to day.'
  where name = 'Operator' and is_default = true;

-- ── 2. Add the new Uploader role to every workspace that lacks it ───────────
insert into public.app_roles
  (workspace_id, name, hierarchy, is_protected, is_delete_protected, is_default, color, description)
select w.id, 'Uploader', 250, false, false, true, '#F59E0B',
       'Uploads and launches profiles. Cannot manage members or settings.'
from public.workspaces w
where not exists (
  select 1 from public.app_roles r
  where r.workspace_id = w.id and r.name = 'Uploader'
);

-- Grant Uploader its permissions (idempotent via on-conflict).
insert into public.role_permissions (role_id, workspace_id, permission_key)
select r.id, r.workspace_id, perm.key
from public.app_roles r
cross join (values
  ('profiles.view'),
  ('profiles.create'),
  ('profiles.launch'),
  ('bulk.create_profiles'),
  ('groups.view')
) as perm(key)
where r.name = 'Uploader' and r.is_default = true
on conflict do nothing;

-- ── 3. Rewrite seed_default_roles() for NEW workspaces ─────────────────────
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
    (p_workspace_id, 'Editor',   200, false, false, true, '#10B981', 'Create, edit, and launch profiles day to day.'),
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

  -- Admin: everything except workspace.delete, billing.*, roles.create/edit/delete
  insert into public.role_permissions (role_id, workspace_id, permission_key)
  select v_admin_id, p_workspace_id, permission_key
  from public.app_permissions
  where permission_key not in (
    'workspace.delete',
    'billing.view', 'billing.manage',
    'roles.create', 'roles.edit', 'roles.delete'
  );

  -- Editor
  insert into public.role_permissions (role_id, workspace_id, permission_key) values
    (v_editor_id, p_workspace_id, 'profiles.view'),
    (v_editor_id, p_workspace_id, 'profiles.create'),
    (v_editor_id, p_workspace_id, 'profiles.edit'),
    (v_editor_id, p_workspace_id, 'profiles.launch'),
    (v_editor_id, p_workspace_id, 'tags.create'),
    (v_editor_id, p_workspace_id, 'groups.view');

  -- Uploader
  insert into public.role_permissions (role_id, workspace_id, permission_key) values
    (v_uploader_id, p_workspace_id, 'profiles.view'),
    (v_uploader_id, p_workspace_id, 'profiles.create'),
    (v_uploader_id, p_workspace_id, 'profiles.launch'),
    (v_uploader_id, p_workspace_id, 'bulk.create_profiles'),
    (v_uploader_id, p_workspace_id, 'groups.view');

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
grant execute on function public.seed_default_roles(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
