-- ===================================================================
-- 0034 — RLS + permission catalogue for public.phone_numbers
-- ===================================================================
-- Phone numbers are personal to a TubeProxies user account (user_id ->
-- users mirror). They are provisioned + billed entirely in TubeProxies;
-- TP Browser only reflects them. So the security model is OWNER-BASED
-- (a user sees only their own numbers), with an optional workspace lens
-- when workspace_id is set and the caller holds 'phone_numbers.view'.
--
-- Clients are read-only here: all writes come from the sync-phone-number
-- edge function via service_role (RLS-bypassing). No insert/update/delete
-- policies for authenticated => those ops are denied for clients, which
-- is exactly what we want (TubeProxies is the sole provisioner).
-- Re-runnable.
-- ===================================================================

-- ── permission catalogue ───────────────────────────────────────────
insert into public.app_permissions (permission_key, category, label, description) values
  ('phone_numbers.view', 'phone_numbers', 'View phone numbers',
    'See phone numbers purchased through TubeProxies.')
on conflict (permission_key) do nothing;

-- ── RLS ─────────────────────────────────────────────────────────────
-- (table already has RLS enabled in 0033.)
drop policy if exists "phone_numbers.read own" on public.phone_numbers;
create policy "phone_numbers.read own" on public.phone_numbers
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "phone_numbers.read workspace" on public.phone_numbers;
create policy "phone_numbers.read workspace" on public.phone_numbers
  for select to authenticated
  using (
    workspace_id is not null
    and public.check_user_permission((select auth.uid()), 'phone_numbers.view', workspace_id)
  );

-- ── backfill the new permission into existing default roles ─────────
-- Grant phone_numbers.view to every role that already has proxies.view
-- (same "can see purchased resources" tier). New workspaces pick it up
-- via seed_default_roles if/when that list is extended; this covers
-- existing workspaces idempotently.
insert into public.role_permissions (role_id, workspace_id, permission_key)
select rp.role_id, rp.workspace_id, 'phone_numbers.view'
from public.role_permissions rp
where rp.permission_key = 'proxies.view'
on conflict (role_id, permission_key) do nothing;

notify pgrst, 'reload schema';
