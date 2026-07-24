-- ===================================================================
-- Security patch — closes findings from the in-depth audit of 0002.
-- Apply AFTER 0002_full_schema.sql.
--
-- Findings closed (by severity):
--
--   CRIT-1: seed_default_roles() was callable by any authenticated user
--           against any workspace — privilege escalation. Revoke execute.
--
--   HIGH-1: block_billing_column_updates() blocked SQL Editor (postgres
--           role) from changing plan in dev/test. Allow postgres + null
--           role too, not just service_role.
--
--   HIGH-2: workspaces.owner_id had NO ACTION — deleting a user with
--           workspaces failed entirely. For v1 simplicity (no ownership-
--           transfer UI), use ON DELETE CASCADE. GDPR delete now works.
--
--   MED-1: workspace_members SELECT policy had a self-referential
--          subquery — replace with user_workspace_ids() helper for
--          consistency with the no-self-reference rule.
--
--   MED-2: workspace_members INSERT didn't pin invited_by — could lie
--          in the audit trail. Pin it.
--
--   MED-3: user_roles INSERT/UPDATE didn't enforce role hierarchy — a
--          user with members.assign_role could promote themselves to
--          Owner. Add can_user_modify_role guard.
--
--   MED-4 + MED-5: workspace INSERT could set plan='team' for free —
--          add a BEFORE INSERT trigger pinning plan to 'free' and
--          stripe_* to NULL for non-service-role callers.
-- ===================================================================

-- ===================================================================
-- CRIT-1: revoke seed_default_roles from authenticated.
-- It's only called by create_workspace() and handle_new_user(), both
-- SECURITY DEFINER — they bypass execute checks on inner functions.
-- ===================================================================
revoke execute on function seed_default_roles(uuid, uuid) from authenticated;

-- ===================================================================
-- HIGH-1: dev-friendly billing-column trigger.
-- Allow updates from:
--   - service_role (Stripe webhook in production)
--   - postgres / supabase_admin (Supabase SQL Editor for manual upgrades during dev)
--   - NULL role (some Supabase admin paths report null)
-- Block authenticated + anon (the actual users we want to gate).
-- ===================================================================
create or replace function block_billing_column_updates()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := auth.role();
begin
  -- Allow service_role (Stripe webhook) and admin paths (SQL Editor).
  if v_role is null
     or v_role in ('service_role', 'postgres', 'supabase_admin')
  then
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

-- ===================================================================
-- MED-4 + MED-5: BEFORE INSERT trigger pinning billing columns.
-- Prevents direct POST /rest/v1/workspaces with plan='team' bypassing
-- Stripe. The same role exemptions apply.
-- ===================================================================
create or replace function pin_billing_columns_on_insert()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := auth.role();
begin
  if v_role is null
     or v_role in ('service_role', 'postgres', 'supabase_admin')
  then
    return new;
  end if;
  -- Force plan to 'free' on INSERT regardless of what the caller sent.
  new.plan := 'free';
  new.stripe_customer_id := null;
  new.stripe_subscription_id := null;
  return new;
end;
$$;

drop trigger if exists workspaces_pin_billing_on_insert on workspaces;
create trigger workspaces_pin_billing_on_insert
  before insert on workspaces
  for each row execute function pin_billing_columns_on_insert();

-- ===================================================================
-- HIGH-2: workspaces.owner_id ON DELETE CASCADE.
-- A user deleting their auth account also deletes their workspace and
-- all its data. For v1, this is the simplest GDPR-compliant choice.
-- (When ownership transfer UI ships in v2, change to SET NULL + require
-- transfer via UI before account deletion.)
-- ===================================================================
alter table workspaces
  drop constraint if exists workspaces_owner_id_fkey,
  add constraint workspaces_owner_id_fkey
    foreign key (owner_id) references auth.users(id) on delete cascade;

-- ===================================================================
-- MED-1: workspace_members SELECT — use the user_workspace_ids() helper
-- instead of a self-referential subquery (consistent with the no-self-
-- reference rule from Scene Flow Pro precedent migrations 008 + 031).
-- ===================================================================
drop policy if exists "members can see members of their workspaces" on workspace_members;
create policy "members read workspace_members"
  on workspace_members for select
  using (workspace_id in (select user_workspace_ids()));

-- ===================================================================
-- MED-2: workspace_members INSERT pins invited_by to caller.
-- Stops members from forging the audit trail by setting invited_by to
-- someone else (or NULL).
-- ===================================================================
drop policy if exists "members.invite" on workspace_members;
create policy "members.invite" on workspace_members for insert
  with check (
    check_user_permission((select auth.uid()), 'members.invite', workspace_id)
    and invited_by = (select auth.uid())
  );

-- ===================================================================
-- MED-3: user_roles INSERT/UPDATE must respect role hierarchy.
-- A Manager with members.assign_role could otherwise assign themselves
-- the Owner role. can_user_modify_role(uid, role_id) gates this:
-- caller's hierarchy must be at-or-above (smaller number than) the
-- target role's hierarchy.
-- ===================================================================
drop policy if exists "user_roles insert via members.assign_role" on user_roles;
create policy "user_roles insert via members.assign_role"
  on user_roles for insert
  with check (
    check_user_permission((select auth.uid()), 'members.assign_role', workspace_id)
    and can_user_modify_role((select auth.uid()), role_id)
  );

drop policy if exists "user_roles update via members.assign_role" on user_roles;
create policy "user_roles update via members.assign_role"
  on user_roles for update
  using (
    check_user_permission((select auth.uid()), 'members.assign_role', workspace_id)
    and can_user_modify_role((select auth.uid()), role_id)
  )
  with check (
    check_user_permission((select auth.uid()), 'members.assign_role', workspace_id)
    and can_user_modify_role((select auth.uid()), role_id)
  );

-- ===================================================================
-- Defense in depth: explicit membership guard inside create_profiles_bulk.
-- The check_user_permission gate already implies membership (you can't
-- have a permission in a workspace you're not in), but an explicit check
-- makes the intent obvious + survives any future bug in the permission
-- system.
-- ===================================================================
create or replace function create_profiles_bulk(
  p_workspace_id uuid,
  p_profiles jsonb
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
  -- Explicit membership guard (defense in depth)
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = v_uid
  ) then
    raise exception 'not a member of this workspace' using errcode = '42501';
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
-- MUT-3: enforce role_permissions.workspace_id matches the role's actual
-- workspace. Without this, a user with roles.edit in workspace A could
-- insert role_permissions rows referencing a role from workspace B —
-- creating cross-workspace permission leaks.
-- ===================================================================
create or replace function enforce_role_permission_workspace_consistency()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role_workspace uuid;
begin
  select workspace_id into v_role_workspace
    from public.app_roles where id = new.role_id;
  if v_role_workspace is null then
    raise exception 'role % does not exist', new.role_id using errcode = 'P0002';
  end if;
  if v_role_workspace is distinct from new.workspace_id then
    raise exception 'role_permissions.workspace_id (%) must match the role''s workspace (%)',
      new.workspace_id, v_role_workspace using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists role_permissions_workspace_check on role_permissions;
create trigger role_permissions_workspace_check
  before insert or update on role_permissions
  for each row execute function enforce_role_permission_workspace_consistency();

-- ===================================================================
-- MUT-4: enforce user_roles.workspace_id matches the role's workspace.
-- Without this, a user with members.assign_role in workspace A could
-- assign a role from workspace B to a user in workspace A — leaking
-- workspace B's permissions into workspace A.
-- ===================================================================
create or replace function enforce_user_role_workspace_consistency()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role_workspace uuid;
begin
  select workspace_id into v_role_workspace
    from public.app_roles where id = new.role_id;
  if v_role_workspace is null then
    raise exception 'role % does not exist', new.role_id using errcode = 'P0002';
  end if;
  if v_role_workspace is distinct from new.workspace_id then
    raise exception 'user_roles.workspace_id (%) must match the role''s workspace (%)',
      new.workspace_id, v_role_workspace using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists user_roles_workspace_check on user_roles;
create trigger user_roles_workspace_check
  before insert or update on user_roles
  for each row execute function enforce_user_role_workspace_consistency();

notify pgrst, 'reload schema';
