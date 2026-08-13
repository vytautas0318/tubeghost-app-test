-- ===================================================================
-- 0045 — Linked YouTube channel on a browser profile
-- ===================================================================
-- The redesigned Profiles page (design system: ui_kits/browser/
-- ProfileCards.jsx) shows each profile as a card carrying the YouTube
-- channel that profile operates: title, @handle and subscriber count.
-- A profile is the *browser identity*; the channel is what that identity
-- is FOR, and operators identify profiles by channel far more reliably
-- than by profile name.
--
-- Stored as a single jsonb blob rather than four columns because it is
-- read and written atomically (one "link channel" action fetches the
-- whole snippet from the YouTube Data API) and is never filtered or
-- joined on. Shape:
--
--   { "title": text, "handle": text, "subs": text|null,
--     "thumbnail": text|null, "channelId": text|null,
--     "linkedAt": timestamptz }
--
-- Null = no channel linked, which is the state every existing row starts
-- in and a perfectly normal steady state (a profile may run Instagram or
-- an Amazon store and have no channel at all).
--
-- No RLS change: browser_profiles' existing per-workspace select/update
-- policies already cover every column, and this one carries no secrets.
--
-- Numbered 0045 to clear both repos' highest migration (0044) per the
-- shared-Supabase numbering rule. Re-runnable.
-- ===================================================================

alter table public.browser_profiles
  add column if not exists youtube_channel jsonb;

comment on column public.browser_profiles.youtube_channel is
  'Linked YouTube channel snippet: {title, handle, subs, thumbnail, channelId, linkedAt}. Null when no channel is linked.';
