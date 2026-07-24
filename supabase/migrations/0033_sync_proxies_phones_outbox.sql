-- ===================================================================
-- 0033 — Cross-project sync surface on TubeGhost (TP Browser)
-- ===================================================================
-- Adds the columns + tables that the TubeProxies <-> TubeGhost sync
-- functions write to:
--   * proxies: link purchased rows back to TubeProxies inventory.
--     We REUSE the existing `source` column ('tubeproxies'|'custom')
--     as the ownership discriminator ('custom' == a manually-added
--     proxy that must NEVER be pushed to TubeProxies). We do NOT add a
--     redundant `origin` column.
--   * phone_numbers: NEW table mirroring TubeProxies phone_numbers.
--     TubeProxies is the sole provisioner; here numbers are created
--     one-way (TP->TG) and status changes flow bidirectionally.
--   * sync_outbox: durable queue of failed cross-project writes for the
--     outbox-retry function.
-- Idempotent + re-runnable.
-- ===================================================================

-- ── 1. proxies: purchase linkage ───────────────────────────────────
-- tubeproxies_id = TubeProxies proxy_inventory.id (uuid). Distinct from
-- the pre-existing tubeproxies_ip_id (text, legacy). Only ever set on
-- rows with source='tubeproxies'.
alter table public.proxies
  add column if not exists tubeproxies_id uuid,
  add column if not exists synced_at      timestamptz;

-- One TubeProxies inventory row maps to at most one TP Browser proxy row
-- per workspace (idempotent upsert key for the sync function).
create unique index if not exists uq_proxies_workspace_tubeproxies_id
  on public.proxies(workspace_id, tubeproxies_id)
  where tubeproxies_id is not null;

comment on column public.proxies.tubeproxies_id is
  'TubeProxies proxy_inventory.id this row was synced from. Set iff source=''tubeproxies''.';
comment on column public.proxies.synced_at is
  'Last time the sync-proxy-status function wrote this row from TubeProxies.';

-- Guard: tubeproxies_id may only be set on tubeproxies-sourced rows.
-- Prevents a manual ('custom') proxy from masquerading as purchased.
create or replace function public.enforce_proxy_origin_linkage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tubeproxies_id is not null and new.source <> 'tubeproxies' then
    raise exception
      'tubeproxies_id may only be set on source=''tubeproxies'' proxies (got source=%)',
      new.source
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_proxy_origin_linkage on public.proxies;
create trigger trg_enforce_proxy_origin_linkage
  before insert or update on public.proxies
  for each row execute function public.enforce_proxy_origin_linkage();

-- ── 2. phone_numbers (NEW) ─────────────────────────────────────────
-- Mirrors TubeProxies public.phone_numbers. Same uuid PK across both
-- projects (loop prevention via shared id + sync_source + content hash).
-- Provisioning-only columns (subscription_id, provisioning_ref) are
-- NULLABLE here because they are TubeProxies-internal — TubeGhost never
-- provisions, it only reflects. user_id references the users mirror.
create table if not exists public.phone_numbers (
  id                uuid primary key,           -- == TubeProxies phone_numbers.id
  user_id           uuid not null references public.users(id) on delete cascade,
  workspace_id      uuid references public.workspaces(id) on delete cascade,
  phone_number      text not null,
  status            text not null,
  service_type      text,
  label             text,
  provisioned_at    timestamptz,
  expires_at        timestamptz,
  released_at       timestamptz,
  -- loop-prevention / provenance
  sync_source       text not null default 'tubeproxies'
                      check (sync_source in ('tubeproxies','tubeghost')),
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.phone_numbers is
  'Mirror of TubeProxies phone_numbers. TubeProxies is the sole provisioner; '
  'rows are created one-way (TP->TG) and status changes flow both ways. '
  'Shared uuid PK with TubeProxies for idempotent, loop-safe upserts.';

create index if not exists idx_phone_numbers_user   on public.phone_numbers(user_id);
create index if not exists idx_phone_numbers_status on public.phone_numbers(status);

alter table public.phone_numbers enable row level security;

-- keep updated_at fresh (reuse the canonical helper from 0001)
drop trigger if exists trg_phone_numbers_touch on public.phone_numbers;
create trigger trg_phone_numbers_touch
  before update on public.phone_numbers
  for each row execute function public.set_updated_at();

-- ── 3. sync_outbox ─────────────────────────────────────────────────
-- Durable record of cross-project writes that failed (peer 5xx, network,
-- etc). The outbox-retry function drains pending rows. Written by the
-- sync edge functions via service_role (bypasses RLS); never client-
-- readable (no policies -> RLS denies authenticated by default).
create table if not exists public.sync_outbox (
  id             uuid primary key default gen_random_uuid(),
  target         text not null,          -- 'tubeproxies' | 'tubeghost'
  entity         text not null,          -- 'phone_number' | 'proxy' | 'user'
  entity_id      uuid not null,
  op             text not null,          -- 'upsert' | 'delete'
  payload        jsonb not null,
  attempts       int  not null default 0,
  max_attempts   int  not null default 10,
  last_error     text,
  next_retry_at  timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index if not exists idx_sync_outbox_pending
  on public.sync_outbox(next_retry_at)
  where resolved_at is null;

alter table public.sync_outbox enable row level security;
-- No policies on purpose: only service_role (edge functions) touches it.

notify pgrst, 'reload schema';
