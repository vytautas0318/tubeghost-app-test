-- ===================================================================
-- 0038 — Direct-signup provisioning (single-project auth)
-- ===================================================================
-- The app now authenticates DIRECTLY against this project (Google OAuth +
-- email magic-link on this project's own GoTrue), instead of the earlier
-- two-project model where TubeProxies was the identity provider and the
-- mirror-user webhook populated public.users + provisioned workspaces.
--
-- With direct signup there is no mirror webhook for THIS project's users,
-- so a brand-new auth.users row must, on its own:
--   1. get a public.users mirror row (all workspace/member/profile FKs
--      reference public.users, not auth.users — see 0031), and
--   2. get a workspace + membership + default roles.
--
-- We reuse the tested public.provision_mirrored_user() RPC (0031) for step 2
-- and add the public.users insert for step 1, wired to a fresh
-- on_auth_user_created trigger (0031 had dropped the old one).
--
-- Idempotent: on conflict do nothing + provision RPC already no-ops if the
-- user is provisioned. Safe alongside the mirror webhook (that path also
-- upserts public.users by id, so a TubeProxies-originated user is unaffected).
-- ===================================================================

create or replace function public.handle_new_user_direct()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name  text;
  v_avatar_url text;
  v_ws_name    text;
begin
  -- OAuth (Google) puts name/avatar in raw_user_meta_data under a few
  -- possible keys; email/password + magic-link may have none.
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), '')
  );
  v_avatar_url := coalesce(
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(new.raw_user_meta_data->>'picture', '')
  );

  -- 1. Mirror row (source-of-truth for FK targets). If the mirror webhook
  --    already created it (same id), keep the existing row.
  insert into public.users (id, email, full_name, avatar_url, role, created_at)
  values (
    new.id,
    coalesce(new.email::text, new.id::text || '@user.local'),
    v_full_name,
    v_avatar_url,
    'user',
    coalesce(new.created_at, now())
  )
  on conflict (id) do nothing;

  -- 2. Workspace + membership + default roles (no-op if already a member).
  v_ws_name := nullif(trim(new.raw_user_meta_data->>'workspace_name'), '');
  perform public.provision_mirrored_user(new.id, v_ws_name);

  return new;
end;
$$;

-- Internal trigger function — never called by clients.
revoke all on function public.handle_new_user_direct() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_direct();

notify pgrst, 'reload schema';
