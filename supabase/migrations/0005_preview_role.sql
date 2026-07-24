-- ===================================================================
-- Add roles.preview permission. Allows a user to view the app as if
-- they held a different role or were a different member. Purely
-- visual — RLS on writes continues to use the real auth.uid(), so
-- preview cannot escalate privilege.
--
-- Hierarchy guard is enforced client-side (see Roles.tsx and
-- Members.tsx): a caller cannot preview a role above their own
-- hierarchy. This is a UX gate; the safety guarantee is that even
-- if bypassed, the previewed perms are read-only at the DB layer.
--
-- Defaults: Owner already gets every permission via the catch-all
-- INSERT in seed_default_roles. Manager already gets everything not
-- in the explicit exclude list (workspace.delete, billing.*,
-- roles.create/edit/delete) — roles.preview is NOT in that list, so
-- Manager picks it up automatically on future workspaces.
--
-- For existing workspaces we backfill manually below.
-- ===================================================================

insert into public.app_permissions (permission_key, category, label, description)
values (
  'roles.preview',
  'roles',
  'Preview roles',
  'View the app as if you held a different role or were another member. Read-only — all mutating actions are disabled.'
)
on conflict (permission_key) do nothing;

-- Backfill: grant roles.preview to every existing Owner role across
-- all workspaces. Owner is identified by is_protected = true (the
-- only is_protected role created by seed_default_roles).
insert into public.role_permissions (role_id, workspace_id, permission_key)
select id, workspace_id, 'roles.preview'
from public.app_roles
where is_protected = true
  and is_default = true
on conflict do nothing;

-- Backfill: grant roles.preview to every existing Manager role.
-- Manager is identified by name = 'Manager' AND is_default = true
-- (custom roles named 'Manager' won't match because is_default=false).
insert into public.role_permissions (role_id, workspace_id, permission_key)
select id, workspace_id, 'roles.preview'
from public.app_roles
where name = 'Manager'
  and is_default = true
on conflict do nothing;

notify pgrst, 'reload schema';
