-- ===================================================================
-- 0039 — Read purchased proxies + phone numbers by logged-in email
-- ===================================================================
-- With direct login (single-project auth), a user's auth.uid() is this
-- project's own GoTrue id, which does NOT equal the TubeProxies user id that
-- their synced purchases are keyed to (phone_numbers.user_id / proxies via
-- workspaces.owner_id both reference public.users.id == the TubeProxies id).
-- So the existing auth.uid()-based RLS hides a user's own purchases.
--
-- Fix: let a logged-in user READ the rows that belong to the TubeProxies
-- account with the SAME EMAIL. We resolve email → TubeProxies user id(s)
-- through public.users (the maintained mirror, kept current by the
-- mirror-user webhook) — NOT a denormalized user_email column — so the match
-- can't drift. The email comes from the verified JWT claim.
--
-- Read-only + additive: these policies only widen SELECT visibility. They do
-- not grant writes and do not touch the existing auth.uid()/workspace
-- policies, which continue to apply for a user whose id DOES match.
-- ===================================================================

-- Supporting index for the email lookup (case-insensitive match).
create index if not exists idx_users_email_lower
  on public.users (lower(email));

-- SECURITY DEFINER helper: the TubeProxies user ids that share the caller's
-- verified JWT email. Bypasses RLS on public.users (avoids recursion + keeps
-- the policy a simple IN-list). Empty when the JWT has no email or no mirror
-- row matches. Email compared case-insensitively (GoTrue lowercases, but the
-- mirror is fed externally — be defensive).
create or replace function public.user_ids_for_current_email()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select u.id
  from public.users u
  where lower(u.email) = lower(nullif(((select auth.jwt()) ->> 'email'), ''))
$$;

revoke all on function public.user_ids_for_current_email() from public, anon;
grant execute on function public.user_ids_for_current_email() to authenticated;

-- ── phone_numbers: read rows owned by the same-email TubeProxies user ──
drop policy if exists "phone_numbers.read by email" on public.phone_numbers;
create policy "phone_numbers.read by email" on public.phone_numbers
  for select to authenticated
  using (user_id in (select public.user_ids_for_current_email()));

-- ── proxies: read rows in a workspace owned by the same-email user ──
-- proxies have no user_id; they live in the workspace whose owner_id is the
-- buyer's TubeProxies id (see sync_upsert_purchased_proxy). Match through that.
drop policy if exists "proxies.read by email" on public.proxies;
create policy "proxies.read by email" on public.proxies
  for select to authenticated
  using (
    workspace_id in (
      select w.id
      from public.workspaces w
      where w.owner_id in (select public.user_ids_for_current_email())
    )
  );

notify pgrst, 'reload schema';
