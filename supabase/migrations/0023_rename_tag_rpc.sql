-- ===================================================================
-- 0023_rename_tag_rpc.sql
-- Tag edit (rename + recolor) that cascades the NEW name into the text[]
-- columns that reference tags by name (profiles.tags,
-- authenticator_tokens.tags). Without this, renaming a tag row orphaned the
-- old name on every profile/token that used it (0020 stores tags by name and
-- did no data migration).
--
-- Recoloring alone needs no cascade (color is resolved by name), but a rename
-- must rewrite every array member in the same workspace atomically — hence a
-- SECURITY DEFINER RPC rather than a client-side multi-row loop.
-- ===================================================================

create or replace function rename_tag(
  p_tag_id uuid,
  p_new_name text,
  p_new_color text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_old_name text;
  v_new_name text := trim(p_new_name);
begin
  if v_new_name = '' then
    raise exception 'Tag name cannot be empty';
  end if;

  select workspace_id, name into v_workspace_id, v_old_name
  from public.tags where id = p_tag_id;
  if v_workspace_id is null then
    raise exception 'Tag not found';
  end if;

  -- Authorize against the tag's own workspace (the caller must hold tags.edit
  -- there). Mirrors the RLS UPDATE policy; enforced here because SECURITY
  -- DEFINER bypasses RLS.
  if not public.check_user_permission((select auth.uid()), 'tags.edit', v_workspace_id) then
    raise exception 'Not authorized to edit tags in this workspace';
  end if;

  -- 1. Update the registry row (name + color).
  update public.tags
  set name = v_new_name, color = p_new_color
  where id = p_tag_id;

  -- 2. Cascade the rename into the name-referencing text[] columns, but only
  -- when the name actually changed (case-sensitive compare — a pure recolor or
  -- case-only no-op skips the array rewrites). array_replace swaps every
  -- matching member; the GIN index on profiles.tags keeps the filter cheap.
  if v_old_name is distinct from v_new_name then
    update public.profiles
    set tags = array_replace(tags, v_old_name, v_new_name)
    where workspace_id = v_workspace_id and tags @> array[v_old_name];

    update public.authenticator_tokens
    set tags = array_replace(tags, v_old_name, v_new_name)
    where workspace_id = v_workspace_id and tags @> array[v_old_name];
  end if;
end;
$$;

grant execute on function rename_tag(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
