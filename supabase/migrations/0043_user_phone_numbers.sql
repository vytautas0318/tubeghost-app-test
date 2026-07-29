-- ===================================================================
-- 0043 — user_phone_numbers: manually-added phone numbers
-- ===================================================================
-- The existing public.phone_numbers table is a READ-ONLY mirror of
-- TubeProxies (sole provisioner; writes only via service_role sync RPC).
-- This table is the opposite: numbers a user types into the "Add phone
-- number" dialog in TubeGhost Browser. It is fully client-owned —
-- authenticated users create/read/update/delete their OWN rows — with an
-- optional workspace lens for teammates who hold 'phone_numbers.view'.
--
-- No TubeProxies coupling: no id-shared PK, no sync_source, no mirror.
-- Numbered 0043 to clear both repos' highest migration (desktop 0042,
-- web 0041) per the shared-Supabase numbering rule.
-- Re-runnable.
-- ===================================================================

create table if not exists public.user_phone_numbers (
  id            uuid primary key default gen_random_uuid(),
  -- Owner. FK to auth.users (not the users mirror) so an insert never
  -- fails on "mirror pending". SET NULL would orphan the row with no
  -- owner to gate RLS on, so CASCADE: the number is meaningless without
  -- its owner (mirrors the workspace_members.user_id rule).
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Optional workspace the number belongs to (enables the team lens).
  workspace_id  uuid references public.workspaces(id) on delete cascade,
  phone_number  text not null,                 -- E.164, e.g. +15551234567
  label         text,                          -- optional user tag
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.user_phone_numbers is
  'Phone numbers a user manually adds in TubeGhost Browser. Client-owned '
  '(owner-based RLS), independent of the TubeProxies-mirrored phone_numbers.';

-- One row per (owner, number): re-adding the same number is a no-op upsert
-- target, not a duplicate.
create unique index if not exists uq_user_phone_numbers_user_number
  on public.user_phone_numbers(user_id, phone_number);

-- Supporting indexes for the RLS-checked columns.
create index if not exists idx_user_phone_numbers_user
  on public.user_phone_numbers(user_id);
create index if not exists idx_user_phone_numbers_workspace
  on public.user_phone_numbers(workspace_id);

alter table public.user_phone_numbers enable row level security;

-- ── updated_at trigger (reuses the shared helper from 0001) ─────────
drop trigger if exists user_phone_numbers_updated_at on public.user_phone_numbers;
create trigger user_phone_numbers_updated_at
  before update on public.user_phone_numbers
  for each row execute function set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────
-- Read: your own rows, OR a workspace row you can view.
drop policy if exists "user_phone_numbers.read own" on public.user_phone_numbers;
create policy "user_phone_numbers.read own" on public.user_phone_numbers
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_phone_numbers.read workspace" on public.user_phone_numbers;
create policy "user_phone_numbers.read workspace" on public.user_phone_numbers
  for select to authenticated
  using (
    workspace_id is not null
    and public.check_user_permission((select auth.uid()), 'phone_numbers.view', workspace_id)
  );

-- Write: you may only create/update/delete rows you own. A workspace_id,
-- when supplied, must be one you actually belong to (prevents attaching a
-- number to a workspace you can't see).
drop policy if exists "user_phone_numbers.insert own" on public.user_phone_numbers;
create policy "user_phone_numbers.insert own" on public.user_phone_numbers
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      workspace_id is null
      or public.check_user_permission((select auth.uid()), 'phone_numbers.view', workspace_id)
    )
  );

drop policy if exists "user_phone_numbers.update own" on public.user_phone_numbers;
create policy "user_phone_numbers.update own" on public.user_phone_numbers
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      workspace_id is null
      or public.check_user_permission((select auth.uid()), 'phone_numbers.view', workspace_id)
    )
  );

drop policy if exists "user_phone_numbers.delete own" on public.user_phone_numbers;
create policy "user_phone_numbers.delete own" on public.user_phone_numbers
  for delete to authenticated
  using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
