-- ===================================================================
-- Open the TubeProxies API integration to the Free plan as well.
--
-- Originally `tubeproxies_api` was Pro+ only (see 0002 lines 171-186).
-- We're moving it to all plans so new users can try the browser end-to-end
-- without first paying. The other plan-gated features (bulk, extensions,
-- force_unlock, custom_roles) stay paid-only.
--
-- Idempotent: ON CONFLICT DO NOTHING handles re-runs and pre-existing rows.
-- ===================================================================

insert into public.plan_features (plan_key, feature_key)
values ('free', 'tubeproxies_api')
on conflict (plan_key, feature_key) do nothing;

notify pgrst, 'reload schema';
