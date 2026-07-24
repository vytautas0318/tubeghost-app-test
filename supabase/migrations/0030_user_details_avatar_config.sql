-- ===================================================================
-- Extend get_workspace_user_details() to also return each member's
-- composable ghost-avatar config (auth.users.raw_user_meta_data->
-- 'avatar_config'). Same membership-gated security model as 0004 —
-- callers can only read configs for members of a workspace they belong
-- to, and only for that workspace.
--
-- Why: the Members page previously showed a hashed initials tile for
-- every member because avatar_config lives on auth.users metadata and
-- was never surfaced per-member. The sidebar renders the current user's
-- GhostAvatar from their own metadata; this RPC change lets the Members
-- page render every member's GhostAvatar too.
--
-- avatar_config is a small JSON blob { color, face, glasses, hat, hand }
-- (see src/renderer/src/lib/avatar.ts). We return it verbatim as jsonb;
-- the renderer tolerates null/partial blobs via readAvatarConfig().
-- ===================================================================

-- CREATE OR REPLACE cannot change a function's OUT columns, so drop the
-- old signature first (it's re-granted below).
drop function if exists get_workspace_user_details(uuid);

create function get_workspace_user_details(p_workspace_id uuid)
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
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      split_part(u.email::text, '@', 1)
    ) as display_name,
    nullif(u.raw_user_meta_data->>'avatar_url', '') as avatar_url,
    -- Only return an object; ignore a non-object legacy value.
    case
      when jsonb_typeof(u.raw_user_meta_data->'avatar_config') = 'object'
        then u.raw_user_meta_data->'avatar_config'
      else null
    end as avatar_config
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id
  where wm.workspace_id = p_workspace_id
    and exists (
      select 1
      from public.workspace_members caller
      where caller.workspace_id = p_workspace_id
        and caller.user_id = (select auth.uid())
    )
$$;

grant execute on function get_workspace_user_details(uuid) to authenticated;

notify pgrst, 'reload schema';
