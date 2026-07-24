-- ===================================================================
-- TubeProxies — triggers that drive the sync edge functions
-- ===================================================================
-- Calls pg_net's net.http_post() DIRECTLY (not the
-- supabase_functions.http_request() wrapper), so this does NOT require
-- the dashboard "Database Webhooks" feature to be enabled — only pg_net.
--
-- Each trigger POSTs the row change to the matching edge function with
-- the shared x-sync-secret header, in the standard
-- {type,table,schema,record,old_record} shape.
--
-- Placeholders (edit before apply, or psql \set):
--   :FUNCTIONS_BASE  e.g. https://qkntgnepntnbnqipuavv.functions.supabase.co
--   :SYNC_SECRET     the SYNC_WEBHOOK_SECRET value
-- Re-runnable.
-- ===================================================================

create extension if not exists pg_net;

-- Generic notifier: one function, parameterised by the target path passed
-- as a trigger argument (tg_argv[0]). Keeps all three triggers on one
-- SECURITY DEFINER function.
create or replace function public.sync_http_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := tg_argv[0];
begin
  perform net.http_post(
    url     := ':FUNCTIONS_BASE/' || v_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', ':SYNC_SECRET'
    ),
    body    := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    )
  );
  return new;
end;
$$;

revoke all on function public.sync_http_notify() from public, anon, authenticated;

-- ── profiles (users) -> mirror-user ────────────────────────────────
drop trigger if exists sync_mirror_user on public.profiles;
create trigger sync_mirror_user
  after insert or update on public.profiles
  for each row execute function public.sync_http_notify('mirror-user');

-- ── proxy_inventory -> sync-proxy-status (one-way, purchase fulfilment) ─
drop trigger if exists sync_proxy_status on public.proxy_inventory;
create trigger sync_proxy_status
  after insert or update on public.proxy_inventory
  for each row execute function public.sync_http_notify('sync-proxy-status');

-- ── phone_numbers -> sync-phone-number (TP -> TP Browser) ──────────
drop trigger if exists sync_phone_number on public.phone_numbers;
create trigger sync_phone_number
  after insert or update on public.phone_numbers
  for each row execute function public.sync_http_notify('sync-phone-number');
