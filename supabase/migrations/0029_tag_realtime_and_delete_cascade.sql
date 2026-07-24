-- ===================================================================
-- 0029_tag_realtime_and_delete_cascade.sql
--
-- Two fixes so tag edits/deletes reflect consistently across every tag UI
-- (the Profiles "Tag" filter dropdown AND the per-row Tags cell/popover, which
-- each mount their own useWorkspaceTags instance):
--
--   1. REALTIME on `tags`. useWorkspaceTags subscribes to postgres_changes on
--      the tags table so a mutation in one hook instance propagates to the
--      others. But `tags` was never added to the supabase_realtime publication,
--      so those events never fired — an edit/delete showed only in the surface
--      that made it and left the others stale until reload. Add the table to
--      the publication and set replica identity full so DELETE/UPDATE payloads
--      carry the old row (the hook filters/patches by payload.old.id).
--
--   2. delete_tag RPC that CASCADES the deletion. Deleting a tag previously did
--      a bare `delete from tags` (registry row only), leaving the tag's NAME
--      orphaned on every profiles.tags / authenticator_tokens.tags array (they
--      store tags by name — see 0023). The name kept rendering as a chip on
--      profiles with a fallback color. This RPC removes the name from those
--      arrays in the same workspace atomically, then deletes the registry row —
--      the delete-side mirror of rename_tag (0023).
-- ===================================================================

-- 1. Realtime -------------------------------------------------------------
-- replica identity full → UPDATE/DELETE realtime payloads include the full old
-- row (needed: useWorkspaceTags keys DELETE off payload.old.id).
alter table public.tags replica identity full;

-- Add to the publication idempotently (add table errors if already a member).
do $$
begin
  alter publication supabase_realtime add table public.tags;
exception
  when duplicate_object then null;
end;
$$;

-- 2. Cascading delete RPC -------------------------------------------------
-- SECURITY DEFINER (bypasses RLS) so the array rewrites across profiles /
-- authenticator_tokens run atomically; authorization is re-checked inside
-- against the tag's own workspace, mirroring the RLS DELETE policy (0020) and
-- rename_tag (0023).
create or replace function delete_tag(p_tag_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_name text;
begin
  select workspace_id, name into v_workspace_id, v_name
  from public.tags where id = p_tag_id;
  if v_workspace_id is null then
    -- Already gone — treat as success (idempotent, matches optimistic UI).
    return;
  end if;

  if not public.check_user_permission((select auth.uid()), 'tags.delete', v_workspace_id) then
    raise exception 'Not authorized to delete tags in this workspace';
  end if;

  -- 1. Strip the name from the text[] columns that reference tags by name.
  -- array_remove drops every matching member; the GIN index on profiles.tags
  -- keeps its containment filter cheap (authenticator_tokens has no GIN index —
  -- same as rename_tag; the per-workspace token count is small).
  update public.profiles
  set tags = array_remove(tags, v_name)
  where workspace_id = v_workspace_id and tags @> array[v_name];

  update public.authenticator_tokens
  set tags = array_remove(tags, v_name)
  where workspace_id = v_workspace_id and tags @> array[v_name];

  -- 2. Delete the registry row.
  delete from public.tags where id = p_tag_id;
end;
$$;

grant execute on function delete_tag(uuid) to authenticated;

-- 3. Reload PostgREST schema cache ---------------------------------------
notify pgrst, 'reload schema';
