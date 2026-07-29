-- ===================================================================
-- TubeProxies (project qkntgnepntnbnqipuavv) — DISABLE the sync surface
-- ===================================================================
-- The sync edge functions (sync-phone-number, sync-proxy-status,
-- mirror-user, outbox-retry) were never deployed to this project, so the
-- DB webhooks + outbox-retry cron were POSTing to /functions/v1/* and
-- getting 404s on every phone_numbers change and every cron tick.
--
-- This migration STOPS the noise by removing the triggers and the cron
-- job that fire those HTTP calls. It intentionally LEAVES the sync
-- surface tables/columns from 0001 in place, so the sync can be
-- re-enabled later simply by re-applying 0002_sync_webhooks.sql (and
-- deploying the functions).
--
-- Reverses: 0002_sync_webhooks.sql + the out-of-band outbox-retry cron.
-- Idempotent + re-runnable.
-- ===================================================================

-- ── 1. Drop the row-change triggers that POST to the edge functions ──
drop trigger if exists sync_mirror_user  on public.profiles;
drop trigger if exists sync_proxy_status on public.proxy_inventory;
drop trigger if exists sync_phone_number on public.phone_numbers;

-- The shared notifier is now unused. Drop it too (re-created by 0002).
drop function if exists public.sync_http_notify();

-- ── 2. Unschedule any pg_cron job that calls outbox-retry ────────────
-- The job was scheduled out-of-band (not in a repo migration), so match
-- it by command text rather than a hard-coded job name. No-op if pg_cron
-- isn't installed or no such job exists.
do $$
declare
  v_jobid bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_jobid in
      select jobid from cron.job where command ilike '%outbox-retry%'
    loop
      perform cron.unschedule(v_jobid);
    end loop;
  end if;
end;
$$;
