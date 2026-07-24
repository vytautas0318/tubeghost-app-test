-- ===================================================================
-- 0032 — Re-point identity-reading RPCs from auth.users to public.users
-- ===================================================================
-- Companion to 0031. Several SECURITY DEFINER RPCs read member email +
-- display name by joining auth.users. Under JWKS Third-Party Auth that
-- table is empty, so they would return nothing (blank Members page,
-- broken invitation dedup, accept_invitation email mismatch).
--
-- Re-point them at public.users (the TubeProxies mirror), which carries
-- email / full_name / avatar_url for every user. The only field the
-- mirror lacks is the composable ghost-avatar `avatar_config` blob —
-- that is a TubeGhost-LOCAL preference, not TubeProxies identity, so we
-- return null for it here (UI falls back to initials). It can be
-- reintroduced later via a local user_prefs table if desired.
--
-- Re-runnable (create or replace). Signatures unchanged where possible;
-- get_workspace_user_details keeps its 0030 OUT columns.
-- ===================================================================

-- ── get_workspace_user_details (0030 shape: + avatar_config) ───────
create or replace function public.get_workspace_user_details(p_workspace_id uuid)
returns table (
  user_id       uuid,
  email         text,
  display_name  text,
  avatar_url    text,
  avatar_config jsonb
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(trim(u.full_name), ''),
      split_part(u.email::text, '@', 1)
    ) as display_name,
    nullif(u.avatar_url, '') as avatar_url,
    null::jsonb as avatar_config   -- TubeGhost-local; not mirrored from TubeProxies
  from public.workspace_members wm
  join public.users u on u.id = wm.user_id
  where wm.workspace_id = p_workspace_id
    and exists (
      select 1
      from public.workspace_members caller
      where caller.workspace_id = p_workspace_id
        and caller.user_id = (select auth.uid())
    )
$$;
grant execute on function public.get_workspace_user_details(uuid) to authenticated;

-- ── create_invitation (0015 version — the live one, extensions path) ─
-- Only the auth.users join for member-email dedup changes; everything
-- else (search_path='extensions' for gen_random_bytes, guards) is kept
-- verbatim from 0015.
create or replace function public.create_invitation(
  p_workspace_id uuid,
  p_email        text,
  p_role_id      uuid,
  p_message      text default null,
  p_ttl_hours    int  default 168
)
returns public.invitations
language plpgsql
security definer
set search_path = 'extensions'   -- for gen_random_bytes (see 0015)
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := lower(trim(p_email));
  v_token text;
  v_row   public.invitations;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.check_user_permission(v_uid, 'members.invite', p_workspace_id) then
    raise exception 'You do not have permission to invite members' using errcode = '42501';
  end if;
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.app_roles r
    where r.id = p_role_id and r.workspace_id = p_workspace_id
  ) then
    raise exception 'Role does not belong to this workspace' using errcode = '22023';
  end if;

  -- member-email dedup: mirror users, not auth.users
  if exists (
    select 1
    from public.workspace_members m
    join public.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id
      and lower(u.email) = v_email
      and m.status <> 'removed'
  ) then
    raise exception 'That person is already a member of this workspace' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.invitations i
    where i.workspace_id = p_workspace_id
      and i.email = v_email
      and i.status = 'pending'
      and i.expires_at > now()
  ) then
    raise exception 'A pending invitation already exists for this email' using errcode = 'P0001';
  end if;

  update public.invitations
    set status = 'expired', updated_at = now()
    where workspace_id = p_workspace_id and email = v_email and status = 'pending';
  delete from public.invitations
    where workspace_id = p_workspace_id and email = v_email and status in ('expired','revoked');

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

-- ── accept_invitation: caller email lookup from mirror ─────────────
-- Only the email-lookup source changes (auth.users -> public.users).
-- The rest of the body is unchanged; we replace the whole function to
-- keep it self-contained and re-runnable.
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

  select lower(u.email) into v_email from public.users u where u.id = v_uid;

  select * into v_inv from public.invitations where token = p_token for update;
  if v_inv.id is null then
    raise exception 'Invitation not found' using errcode = 'P0001';
  end if;
  if v_inv.status <> 'pending' or v_inv.expires_at <= now() then
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

notify pgrst, 'reload schema';
