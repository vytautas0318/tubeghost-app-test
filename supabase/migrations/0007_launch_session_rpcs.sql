-- ===================================================================
-- Phase 4 — fingerprint-chromium launcher
--
-- Adds three RPCs the launcher needs on top of the lock RPCs that
-- already exist in 0001 (try_acquire_profile_lock, update_profile_heartbeat,
-- release_profile_lock, force_release_profile_lock). All three follow
-- the canonical SECURITY DEFINER pattern from CLAUDE.md:
--   - SET search_path = ''
--   - Fully qualified table refs (public.x)
--   - Explicit GRANT EXECUTE TO authenticated
-- ===================================================================

-- 1. update_profile_egress_ip ---------------------------------------
-- Called by the renderer right after the proxy precheck passes, so the
-- profile row remembers what IP it was last seen using. Only the holder
-- of the lock can update — prevents stale heartbeats from racing the
-- next session's egress write.
--
-- Also re-checks `profiles.launch` permission. The lock-holder might
-- have lost the permission *after* try_acquire_profile_lock granted
-- the lock (e.g. an admin demoted them mid-session). The lock check
-- alone is not a sufficient authorization gate.
create or replace function update_profile_egress_ip(
  p_profile_id uuid,
  p_session_id uuid,
  p_egress_ip text
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id
    from public.profiles
   where id = p_profile_id
     and open_session_id = p_session_id;
  if v_workspace_id is null then return false; end if;

  if not public.check_user_permission(auth.uid(), 'profiles.launch', v_workspace_id) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  -- Note: only updates last_known_egress_ip. We deliberately do NOT
  -- bump last_opened_at on every egress refresh — that column tracks
  -- "when was this profile launched", not "when did egress last
  -- change". The heartbeat column already tracks liveness.
  update public.profiles
     set last_known_egress_ip = p_egress_ip
   where id = p_profile_id
     and open_session_id = p_session_id;
  return found;
end;
$$;
grant execute on function update_profile_egress_ip(uuid, uuid, text) to authenticated;

-- 2. bulk_release_locks_for_session ---------------------------------
-- App-quit cleanup. Renderer drains the list of session_ids it spawned
-- this run; we release each row only if the *current user* still holds
-- it (defense-in-depth: another user's matching session_id should never
-- exist, but enforcing it server-side prevents a renderer bug from
-- releasing other users' locks).
create or replace function bulk_release_locks_for_session(
  p_session_ids uuid[]
)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_released integer;
begin
  if p_session_ids is null or array_length(p_session_ids, 1) is null then
    return 0;
  end if;

  update public.profiles
     set open_session_id = null,
         open_by_user_id = null,
         open_by_device  = null,
         open_at         = null,
         open_heartbeat_at = null
   where open_session_id = any(p_session_ids)
     and open_by_user_id = auth.uid();

  get diagnostics v_released = row_count;
  return v_released;
end;
$$;
grant execute on function bulk_release_locks_for_session(uuid[]) to authenticated;

-- 3. list_my_active_sessions ----------------------------------------
-- Boot-time recovery. Returns every profile this user currently holds
-- the lock on, across all their workspaces. The renderer compares this
-- against the in-memory child-process map; any row whose session is not
-- locally tracked is stale and gets released via release_profile_lock.
--
-- Returns minimal columns — full profile rows are not needed and would
-- bloat the cross-workspace fan-out.
create or replace function list_my_active_sessions()
returns table(
  profile_id        uuid,
  workspace_id      uuid,
  open_session_id   uuid,
  open_by_device    text,
  open_at           timestamptz,
  open_heartbeat_at timestamptz
)
language sql security definer stable set search_path = '' as $$
  select id, workspace_id, open_session_id, open_by_device, open_at, open_heartbeat_at
    from public.profiles
   where open_by_user_id = auth.uid()
     and open_session_id is not null;
$$;
grant execute on function list_my_active_sessions() to authenticated;

-- Supporting partial index for list_my_active_sessions(). Existing
-- idx_profiles_open_lock (0001 line 126) only indexes open_session_id;
-- we filter on open_by_user_id, which would otherwise table-scan.
create index if not exists idx_profiles_open_by_user
  on public.profiles(open_by_user_id)
  where open_by_user_id is not null;

notify pgrst, 'reload schema';
