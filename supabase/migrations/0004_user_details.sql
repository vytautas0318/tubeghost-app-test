-- ===================================================================
-- get_workspace_user_details() — expose auth.users.email + display name
-- to the renderer in a membership-gated, plan-scoped way.
--
-- Why we need this:
--   PostgREST does not expose auth.users directly. The renderer needs
--   member emails for Settings (Owner email) and Members (member list,
--   future invite display). Without this RPC, the UI shows raw UUIDs
--   which is unworkable.
--
-- Security model:
--   1. SECURITY DEFINER (so it can read auth.users — RLS bypassed)
--   2. SET search_path = '' (Scene Flow Pro perf+security rule)
--   3. Membership guard: caller MUST be a member of the workspace they
--      query, AND only members of THAT workspace are returned. No way
--      to enumerate users from other workspaces — even with a valid
--      workspace_id UUID for one you're not in, you get 0 rows.
--   4. GRANT EXECUTE TO authenticated only.
--
-- Plan-scoped: cross-workspace data leakage is impossible because the
-- inner WHERE clause restricts both the caller-membership check AND
-- the returned users to the SAME workspace_id.
-- ===================================================================

create or replace function get_workspace_user_details(p_workspace_id uuid)
returns table (
  user_id      uuid,
  email        text,
  display_name text,
  avatar_url   text
)
language sql
security definer
stable
set search_path = ''
as $$
  -- Drive the join from workspace_members (small, indexed by composite PK)
  -- and join to auth.users (potentially huge — every user in the project).
  -- Postgres can also flip this, but stating the small side first guarantees
  -- the planner picks the workspace_members PK as the access driver.
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      split_part(u.email::text, '@', 1)
    ) as display_name,
    nullif(u.raw_user_meta_data->>'avatar_url', '') as avatar_url
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id
  where wm.workspace_id = p_workspace_id
    -- Membership guard: caller must be a member of THIS workspace. If they
    -- aren't, the EXISTS is false → 0 rows. (select auth.uid()) — per the
    -- "evaluate once per query" perf rule (Scene Flow Pro CLAUDE.md).
    and exists (
      select 1
      from public.workspace_members caller
      where caller.workspace_id = p_workspace_id
        and caller.user_id = (select auth.uid())
    )
$$;

grant execute on function get_workspace_user_details(uuid) to authenticated;

notify pgrst, 'reload schema';
