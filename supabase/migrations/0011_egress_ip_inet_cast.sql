-- ===================================================================
-- Fix: update_profile_egress_ip casts text → inet explicitly.
--
-- Migration 0007 created the function with `p_egress_ip text` and
-- assigned it directly to profiles.last_known_egress_ip, which is of
-- type inet. Postgres doesn't auto-cast text → inet on assignment, so
-- every call returned 42804:
--   "column 'last_known_egress_ip' is of type inet but expression is
--    of type text"
--
-- Fix: keep the parameter as text (RPC clients pass plain strings) but
-- cast on assignment with `::inet`. Falls back gracefully if the IP
-- string is malformed: NULL on cast failure rather than crashing.
-- ===================================================================

create or replace function update_profile_egress_ip(
  p_profile_id uuid,
  p_session_id uuid,
  p_egress_ip text
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_workspace_id uuid;
  v_egress_inet inet;
begin
  select workspace_id into v_workspace_id
    from public.profiles
   where id = p_profile_id
     and open_session_id = p_session_id;
  if v_workspace_id is null then return false; end if;

  if not public.check_user_permission(auth.uid(), 'profiles.launch', v_workspace_id) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  -- Cast text → inet defensively. A malformed IP from the client
  -- shouldn't crash the RPC; we just record null in that case so the
  -- next heartbeat / egress refresh can try again with a valid value.
  begin
    v_egress_inet := p_egress_ip::inet;
  exception when others then
    v_egress_inet := null;
  end;

  update public.profiles
     set last_known_egress_ip = v_egress_inet
   where id = p_profile_id
     and open_session_id = p_session_id;
  return found;
end;
$$;

notify pgrst, 'reload schema';
