-- ===================================================================
-- Session URL Memory.
--
-- Stores the tab URLs that were open when a profile's browser last
-- closed, so they can be reopened on the next launch. This column is a
-- MIRROR for UI display + cross-device visibility — the per-device
-- source of truth is a local file in the engine user-data-dir, written
-- by the Electron main process (src/main/engine/session-tabs.ts). The
-- renderer copies it here on the `profiles:exited` event.
--
-- Deliberately a SEPARATE column from `tags`: session URLs are never
-- mixed with the user's manual labels.
--
-- No new RLS / index needed: the column rides the existing per-row
-- profiles policies (a user who can edit the profile can read/write it),
-- and it's never referenced in a policy expression.
-- ===================================================================

alter table public.profiles
  add column if not exists session_urls text[] default '{}';

notify pgrst, 'reload schema';
