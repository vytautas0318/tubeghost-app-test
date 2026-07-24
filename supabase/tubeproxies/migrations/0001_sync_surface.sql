-- ===================================================================
-- TubeProxies (project qkntgnepntnbnqipuavv) — cross-project sync surface
-- ===================================================================
-- Runs against the TubeProxies web-app database, NOT TP Browser. Kept in
-- this repo (supabase/tubeproxies/) for co-location; apply it with the
-- TubeProxies project ref (see RUNBOOK.md "Deployment order").
--
-- Adds the columns + tables the sync functions/webhooks depend on:
--   * proxy_inventory: tubeghost_synced_at (one-way TP->TG watermark)
--   * phone_numbers:   sync_source + last_synced_at (loop prevention)
--   * sync_outbox:     durable retry queue for failed TG writes
--
-- IMPORTANT: does NOT touch identity/auth here — TubeProxies stays the
-- identity provider and its profiles/auth.users are unchanged.
-- Idempotent + re-runnable.
-- ===================================================================

-- ── 1. proxy_inventory watermark ───────────────────────────────────
alter table public.proxy_inventory
  add column if not exists tubeghost_synced_at timestamptz;

comment on column public.proxy_inventory.tubeghost_synced_at is
  'Last time this row was pushed to TP Browser by the sync-proxy-status '
  'webhook/function. NULL = never synced.';

-- ── 2. phone_numbers loop-prevention columns ───────────────────────
-- id is already a uuid PK (shared with TP Browser). Add provenance +
-- watermark so bidirectional status sync does not bounce.
alter table public.phone_numbers
  add column if not exists sync_source    text,
  add column if not exists last_synced_at timestamptz;

-- default provenance for existing rows: they originated in TubeProxies
update public.phone_numbers
  set sync_source = 'tubeproxies'
  where sync_source is null;

alter table public.phone_numbers
  alter column sync_source set default 'tubeproxies';

-- constrain to the two known origins (drop-then-add for re-runnability)
alter table public.phone_numbers
  drop constraint if exists phone_numbers_sync_source_chk;
alter table public.phone_numbers
  add constraint phone_numbers_sync_source_chk
  check (sync_source is null or sync_source in ('tubeproxies','tubeghost'));

comment on column public.phone_numbers.sync_source is
  'Which project last authored this row. Set by the sync-phone-number '
  'function to the SOURCE project so the peer webhook can no-op its own '
  'echo (loop prevention).';

-- ── 3. sync_outbox (mirror of the TP Browser table) ────────────────
create table if not exists public.sync_outbox (
  id             uuid primary key default gen_random_uuid(),
  target         text not null,          -- 'tubeghost'
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
-- no policies: only service_role (edge functions) touches it.

-- ── 4. sync_apply_phone_status RPC ─────────────────────────────────
-- Called by TP Browser's sync-phone-number function (via service_role)
-- to reflect a TubeGhost-authored status change back into TubeProxies.
-- NEVER creates a number (TubeProxies is the sole provisioner): if the
-- id is unknown, it is a no-op. Content-guarded so an echo does nothing,
-- and stamps sync_source='tubeghost' so TubeProxies' OWN outbound webhook
-- can recognise + skip the resulting UPDATE.
create or replace function public.sync_apply_phone_status(
  p_id          uuid,
  p_status      text,
  p_label       text default null,
  p_released_at timestamptz default null,
  p_expires_at  timestamptz default null,
  p_sync_source text default 'tubeghost'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.phone_numbers pn set
    status         = p_status,
    label          = coalesce(p_label, pn.label),
    released_at    = p_released_at,
    expires_at     = coalesce(p_expires_at, pn.expires_at),
    sync_source    = coalesce(p_sync_source, 'tubeghost'),
    last_synced_at = now(),
    updated_at     = now()
  where pn.id = p_id
    and (
      pn.status      is distinct from p_status
      or pn.released_at is distinct from p_released_at
      or (p_label is not null and pn.label is distinct from p_label)
    );

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.sync_apply_phone_status(uuid, text, text, timestamptz, timestamptz, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
