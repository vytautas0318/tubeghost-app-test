-- ===================================================================
-- Browser core catalog narrowed to Chromium 150 / 148.
--
-- 0025_settings.sql seeded workspaces with browser_core '142', and the
-- renderer's Browser core <select> no longer offers 142 / 131 / 130.
-- A stored value with no matching <option> renders as a blank select,
-- so migrate any retired version forward to the new recommended core.
--
-- Only rewrites the single key; every other fingerprint default on the
-- row is preserved (jsonb || overwrites just the supplied key).
-- ===================================================================
update public.workspaces
set fingerprint_defaults =
      fingerprint_defaults || jsonb_build_object('browser_core', '150')
where fingerprint_defaults->>'browser_core' in ('142', '131', '130');

notify pgrst, 'reload schema';
