-- ===================================================================
-- 0028_google_optimized.sql
-- Per-profile "Google/YouTube Optimized" preset flag.
--
-- The editor has a single toggle that applies a coherent anti-detect
-- bundle (WebRTC=Forward, timezone/language/location=Based on IP,
-- display-language=Based on Language, WebGL=Custom-masked — nothing on
-- "Real"). The bundle itself is expressed entirely through the existing
-- fingerprint columns, so this flag is DERIVABLE from them; we persist it
-- explicitly only so the UI can restore the user's intent (and their prior
-- values on OFF) without re-deriving.
--
-- No RLS change needed: `profiles` already has workspace-scoped policies
-- (profiles.edit gates every column). This is one more editable column.
-- ===================================================================

alter table profiles
  add column if not exists google_optimized boolean not null default false;

comment on column profiles.google_optimized is
  'True when the profile matches the Google/YouTube Optimized fingerprint preset (WebRTC forward, timezone/language/location based-on-IP, display-language based-on-language, WebGL custom). Derivable from the fingerprint columns; stored to preserve UI intent.';

notify pgrst, 'reload schema';
