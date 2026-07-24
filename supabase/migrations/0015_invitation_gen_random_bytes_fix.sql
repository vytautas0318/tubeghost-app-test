-- ===================================================================
-- 0015_invitation_gen_random_bytes_fix.sql
--
-- Fixes: "function public.gen_random_bytes(integer) does not exist" when
-- sending an invitation.
--
-- Cause: 0014's create_invitation / resend_invitation run with
-- `search_path = ''` (correct hardening) but called `public.gen_random_bytes`.
-- On Supabase, pgcrypto is installed into the `extensions` schema, not
-- `public`, so the schema-qualified reference resolved to nothing.
--
-- Fix: set `search_path = 'extensions'` on ONLY these two functions and call
-- `gen_random_bytes` unqualified, so it resolves wherever pgcrypto lives.
-- Every table reference stays fully `public.`-qualified — the security
-- posture from 0014 is unchanged (no bare table names introduced).
--
-- This is idempotent (create or replace) and touches nothing else.
-- ===================================================================

-- Belt-and-suspenders: ensure pgcrypto is present in the extensions schema.
create extension if not exists pgcrypto with schema extensions;

-- 7a. create_invitation (search_path fixed) ---------------------------------
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

-- 7e. resend_invitation (search_path fixed) ---------------------------------
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

notify pgrst, 'reload schema';
