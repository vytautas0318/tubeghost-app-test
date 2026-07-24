-- ===================================================================
-- 0025_session_sync_delete_policy.sql
-- Add the missing DELETE policy on profile_session_sync.
--
-- 0024 shipped view/insert/update policies for the metadata table plus a
-- delete policy on storage.objects, but NOT a delete policy on the
-- profile_session_sync row itself. Consequence: when a profile is deleted the
-- ON DELETE CASCADE from profiles still removes the row (that path is a
-- system-level cascade, not an RLS-checked DELETE), but a client trying to
-- explicitly delete the metadata row (e.g. a "forget synced session" action,
-- or test cleanup) is silently filtered to 0 rows. This adds the policy so an
-- authorized member can delete the row, gated the same way as update.
--
-- Idempotent: drops-if-exists then recreates.
-- ===================================================================

drop policy if exists "session_sync.delete" on profile_session_sync;
create policy "session_sync.delete" on profile_session_sync for delete
  using (
    check_user_permission((select auth.uid()), 'sessions.sync', workspace_id)
    and exists (
      select 1 from public.profiles p
      where p.id = profile_session_sync.profile_id
        and (p.assigned_to is null or p.assigned_to = (select auth.uid())
             or check_user_permission((select auth.uid()), 'profiles.assign_member', workspace_id))
    )
  );

notify pgrst, 'reload schema';
