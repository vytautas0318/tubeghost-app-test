-- ===================================================================
-- 0014_members_invitations.sql
-- Members module — Phase 1 (MVP)
--
-- Extends the existing workspace_members / RBAC model with:
--   1. Member lifecycle status + last-seen tracking
--   2. An invitations table (pending → accepted / expired / revoked)
--   3. A `members.disable` permission (enable/disable members)
--   4. SECURITY DEFINER RPCs for the invite lifecycle:
--        create_invitation / validate_invitation / accept_invitation /
--        revoke_invitation / resend_invitation
--   5. RLS wiring gated on the existing members.* permission keys
--
-- Design notes:
--   * Acceptance runs in a SECURITY DEFINER RPC because the invitee is not
--     yet a workspace member, so a normal RLS INSERT into workspace_members
--     would be blocked. The RPC validates token + expiry + email match, then
--     inserts the membership atomically. (Matches create_workspace /
--     seed_default_roles.)
--   * Tokens are 32 cryptographically-random bytes (gen_random_bytes), hex.
--   * Additive + idempotent: safe to run against existing workspaces. New
--     permission keys are backfilled onto Owner + Manager so already-created
--     workspaces keep working.
-- ===================================================================

-- pgcrypto provides gen_random_bytes; enabled by Supabase but be explicit.
create extension if not exists pgcrypto with schema extensions;

-- ===================================================================
-- 1. workspace_members: status + last_seen_at + updated_at
-- ===================================================================
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'member_status' and n.nspname = 'public'
  ) then
    create type public.member_status as enum ('pending', 'active', 'disabled', 'removed');
  end if;
end $$;

alter table public.workspace_members
  add column if not exists status      public.member_status not null default 'active',
  add column if not exists last_seen_at timestamptz,
  add column if not exists created_at   timestamptz not null default now(),
  add column if not exists updated_at   timestamptz not null default now();

-- ===================================================================
-- 2. invitations table
-- ===================================================================
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'invitation_status' and n.nspname = 'public'
  ) then
    create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
  end if;
end $$;

create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  email        text not null,
  role_id      uuid not null references public.app_roles on delete restrict,
  token        text not null unique,
  status       public.invitation_status not null default 'pending',
  message      text,
  expires_at   timestamptz not null,
  created_by   uuid references auth.users on delete set null,
  accepted_by  uuid references auth.users on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Emails are stored lowercased (enforced in the RPCs). One live invite per
-- (workspace, email): a partial unique index scoped to status='pending'
-- lets the same email be re-invited after a prior invite is revoked/expired.
create unique index if not exists invitations_one_pending_per_email
  on public.invitations (workspace_id, email)
  where status = 'pending';

create index if not exists invitations_workspace_idx on public.invitations (workspace_id);
create index if not exists invitations_token_idx      on public.invitations (token);
create index if not exists invitations_email_idx      on public.invitations (lower(email));

-- ===================================================================
-- 3. New permission: members.disable
-- ===================================================================
insert into public.app_permissions (permission_key, category, label, description) values
  ('members.disable', 'members', 'Disable members', 'Disable or re-enable members without removing them.')
on conflict (permission_key) do nothing;

-- Backfill onto existing Owner + Manager roles so live workspaces keep parity
-- with seed_default_roles (Owner = all; Manager = all except billing/roles-mgmt/workspace.delete).
insert into public.role_permissions (role_id, workspace_id, permission_key)
select r.id, r.workspace_id, 'members.disable'
from public.app_roles r
where r.name in ('Owner', 'Manager')
on conflict do nothing;

-- Keep new-workspace seeding in sync: Manager's exclusion list is unchanged,
-- so members.disable is picked up automatically by the "all except …" query
-- in seed_default_roles(). No edit to that function required.

-- ===================================================================
-- 4. RLS: invitations
-- ===================================================================
alter table public.invitations enable row level security;

drop policy if exists "invitations.view"   on public.invitations;
drop policy if exists "invitations.create" on public.invitations;
drop policy if exists "invitations.update" on public.invitations;

-- Anyone who can see members can see the workspace's invitations.
create policy "invitations.view" on public.invitations for select
  using (public.check_user_permission((select auth.uid()), 'members.view', workspace_id));

-- Direct writes require members.invite. In practice the RPCs (SECURITY
-- DEFINER) do the writes, but the policy keeps ad-hoc access consistent.
create policy "invitations.create" on public.invitations for insert
  with check (public.check_user_permission((select auth.uid()), 'members.invite', workspace_id));

create policy "invitations.update" on public.invitations for update
  using (public.check_user_permission((select auth.uid()), 'members.invite', workspace_id))
  with check (public.check_user_permission((select auth.uid()), 'members.invite', workspace_id));

-- ===================================================================
-- 5. RLS: allow disabling/enabling members (UPDATE) via members.disable
--    (existing policies only covered insert/select/delete)
-- ===================================================================
drop policy if exists "members.disable" on public.workspace_members;
create policy "members.disable" on public.workspace_members for update
  using (public.check_user_permission((select auth.uid()), 'members.disable', workspace_id))
  with check (public.check_user_permission((select auth.uid()), 'members.disable', workspace_id));

-- ===================================================================
-- 6. updated_at touch trigger (shared)
-- ===================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_invitations_updated_at on public.invitations;
create trigger trg_invitations_updated_at
  before update on public.invitations
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_workspace_members_updated_at on public.workspace_members;
create trigger trg_workspace_members_updated_at
  before update on public.workspace_members
  for each row execute function public.touch_updated_at();

-- ===================================================================
-- 7. Invitation lifecycle RPCs
-- ===================================================================
-- All are SECURITY DEFINER + explicit permission checks (fail closed), and
-- run with an empty search_path so every reference is schema-qualified.

-- 7a. create_invitation ------------------------------------------------------
-- Validates: caller has members.invite, email is not already an active member,
-- no live pending invite exists (unless overwriting an expired/revoked one),
-- role belongs to the workspace. Returns the created invitation row.
create or replace function public.create_invitation(
  p_workspace_id uuid,
  p_email        text,
  p_role_id      uuid,
  p_message      text default null,
  p_ttl_hours    int  default 168          -- 7 days
)
returns public.invitations
language plpgsql security definer set search_path = 'extensions' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text := lower(trim(p_email));
  v_token  text;
  v_row    public.invitations;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.check_user_permission(v_uid, 'members.invite', p_workspace_id) then
    raise exception 'You do not have permission to invite members' using errcode = '42501';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address' using errcode = '22023';
  end if;

  -- Role must belong to this workspace.
  if not exists (
    select 1 from public.app_roles r
    where r.id = p_role_id and r.workspace_id = p_workspace_id
  ) then
    raise exception 'Role does not belong to this workspace' using errcode = '22023';
  end if;

  -- Reject if the email already maps to a live (non-removed) member.
  if exists (
    select 1
    from public.workspace_members m
    join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id
      and lower(u.email) = v_email
      and m.status <> 'removed'
  ) then
    raise exception 'That person is already a member of this workspace' using errcode = 'P0001';
  end if;

  -- Reject duplicate live pending invite.
  if exists (
    select 1 from public.invitations i
    where i.workspace_id = p_workspace_id
      and i.email = v_email
      and i.status = 'pending'
      and i.expires_at > now()
  ) then
    raise exception 'A pending invitation already exists for this email' using errcode = 'P0001';
  end if;

  -- Clear any stale (expired/revoked, or lapsed pending) rows so the partial
  -- unique index doesn't collide and we keep one row per email.
  update public.invitations
    set status = 'expired', updated_at = now()
    where workspace_id = p_workspace_id and email = v_email and status = 'pending';
  delete from public.invitations
    where workspace_id = p_workspace_id and email = v_email and status in ('expired', 'revoked');

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.invitations
    (workspace_id, email, role_id, token, message, expires_at, created_by)
  values
    (p_workspace_id, v_email, p_role_id, v_token, nullif(trim(p_message), ''),
     now() + make_interval(hours => greatest(p_ttl_hours, 1)), v_uid)
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_invitation(uuid, text, uuid, text, int) to authenticated;

-- 7b. validate_invitation ----------------------------------------------------
-- Public-ish read by token (used on the accept screen before the user is a
-- member). Returns a thin, safe projection; never exposes the token itself.
-- Lazily flips a lapsed pending invite to 'expired'.
create or replace function public.validate_invitation(p_token text)
returns table (
  invitation_id  uuid,
  workspace_id   uuid,
  workspace_name text,
  email          text,
  role_id        uuid,
  role_name      text,
  status         public.invitation_status,
  message        text,
  expires_at     timestamptz,
  is_valid       boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.invitations;
begin
  select * into v_row from public.invitations where token = p_token;
  if v_row.id is null then
    return;                       -- empty result = unknown token
  end if;

  -- Lazy expiry.
  if v_row.status = 'pending' and v_row.expires_at <= now() then
    update public.invitations set status = 'expired', updated_at = now() where id = v_row.id;
    v_row.status := 'expired';
  end if;

  return query
    select
      v_row.id,
      v_row.workspace_id,
      (select w.name from public.workspaces w where w.id = v_row.workspace_id),
      v_row.email,
      v_row.role_id,
      (select r.name from public.app_roles r where r.id = v_row.role_id),
      v_row.status,
      v_row.message,
      v_row.expires_at,
      (v_row.status = 'pending' and v_row.expires_at > now());
end;
$$;
grant execute on function public.validate_invitation(text) to authenticated;

-- 7c. accept_invitation ------------------------------------------------------
-- The authenticated invitee redeems a token. Validates the token is live and
-- that the caller's email matches the invite, then inserts (or reactivates)
-- the membership as 'active', assigns the invited role, and marks the invite
-- accepted — all atomically.
create or replace function public.accept_invitation(p_token text)
returns public.workspace_members
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_inv    public.invitations;
  v_member public.workspace_members;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select * into v_inv from public.invitations where token = p_token for update;
  if v_inv.id is null then
    raise exception 'Invitation not found' using errcode = 'P0001';
  end if;
  if v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    -- Reflect lapse.
    if v_inv.status = 'pending' then
      update public.invitations set status = 'expired', updated_at = now() where id = v_inv.id;
    end if;
    raise exception 'This invitation is no longer valid' using errcode = 'P0001';
  end if;
  if v_inv.email <> v_email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  -- Upsert membership as active. Reactivates a previously-removed member.
  insert into public.workspace_members (workspace_id, user_id, invited_by, status, joined_at)
  values (v_inv.workspace_id, v_uid, v_inv.created_by, 'active', now())
  on conflict (workspace_id, user_id) do update
    set status = 'active', invited_by = excluded.invited_by, updated_at = now()
  returning * into v_member;

  -- Assign the invited role (idempotent).
  insert into public.user_roles (user_id, role_id, workspace_id, assigned_by)
  values (v_uid, v_inv.role_id, v_inv.workspace_id, v_inv.created_by)
  on conflict (user_id, workspace_id) do update
    set role_id = excluded.role_id;

  update public.invitations
    set status = 'accepted', accepted_by = v_uid, accepted_at = now(), updated_at = now()
    where id = v_inv.id;

  return v_member;
end;
$$;
grant execute on function public.accept_invitation(text) to authenticated;

-- 7d. revoke_invitation ------------------------------------------------------
create or replace function public.revoke_invitation(p_invitation_id uuid)
returns public.invitations
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.invitations;
begin
  select * into v_row from public.invitations where id = p_invitation_id;
  if v_row.id is null then
    raise exception 'Invitation not found' using errcode = 'P0001';
  end if;
  if not public.check_user_permission(v_uid, 'members.invite', v_row.workspace_id) then
    raise exception 'You do not have permission to manage invitations' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Only pending invitations can be revoked' using errcode = 'P0001';
  end if;

  update public.invitations set status = 'revoked', updated_at = now()
    where id = p_invitation_id
    returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.revoke_invitation(uuid) to authenticated;

-- 7e. resend_invitation ------------------------------------------------------
-- Regenerates the token + extends expiry on a pending (or lapsed-pending)
-- invite, returning the fresh row so the caller can re-share the link.
create or replace function public.resend_invitation(
  p_invitation_id uuid,
  p_ttl_hours     int default 168
)
returns public.invitations
language plpgsql security definer set search_path = 'extensions' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.invitations;
begin
  select * into v_row from public.invitations where id = p_invitation_id;
  if v_row.id is null then
    raise exception 'Invitation not found' using errcode = 'P0001';
  end if;
  if not public.check_user_permission(v_uid, 'members.invite', v_row.workspace_id) then
    raise exception 'You do not have permission to manage invitations' using errcode = '42501';
  end if;
  if v_row.status not in ('pending', 'expired') then
    raise exception 'Only pending or expired invitations can be resent' using errcode = 'P0001';
  end if;

  update public.invitations
    set token      = encode(gen_random_bytes(32), 'hex'),
        status     = 'pending',
        expires_at = now() + make_interval(hours => greatest(p_ttl_hours, 1)),
        updated_at = now()
    where id = p_invitation_id
    returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.resend_invitation(uuid, int) to authenticated;

-- 7f. touch_last_seen --------------------------------------------------------
-- Lightweight heartbeat the client calls on workspace focus.
create or replace function public.touch_member_last_seen(p_workspace_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.workspace_members
    set last_seen_at = now()
    where workspace_id = p_workspace_id and user_id = (select auth.uid());
$$;
grant execute on function public.touch_member_last_seen(uuid) to authenticated;

notify pgrst, 'reload schema';
