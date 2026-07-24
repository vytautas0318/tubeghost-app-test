-- 0027_can_create_workspace.sql
--
-- Capability prefetch for the "Create workspace" UI control.
--
-- The client must not duplicate the create-workspace rule inline (it would
-- drift from the backend). This RPC returns the capability derived from the
-- SAME condition create_workspace() enforces, so the UI can disable the
-- control with a clear reason instead of letting the form submit and error.
--
-- SINGLE SOURCE OF TRUTH: the rule lives in two places that must move together
-- — the guard in create_workspace() (0002_full_schema.sql) and the predicate
-- here. If the model changes (e.g. allow multiple owned workspaces, or
-- one-personal-plus-many-team), update BOTH and the button re-enables itself.
--
-- Current rule: a user may OWN at most one workspace.

create or replace function can_create_workspace()
returns table(allowed boolean, reason text)
language sql security definer stable set search_path = '' as $$
  select
    not exists (select 1 from public.workspaces where owner_id = auth.uid()) as allowed,
    case
      when exists (select 1 from public.workspaces where owner_id = auth.uid())
      then 'You already own a workspace. Each user can own only one.'
      else null
    end as reason
$$;

grant execute on function can_create_workspace() to authenticated;

notify pgrst, 'reload schema';
