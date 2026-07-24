-- ===================================================================
-- 0036 — TP Browser: phone status change -> TubeProxies (reverse sync)
-- ===================================================================
-- Fires the TP-Browser sync-phone-number function when a number's status
-- changes HERE (only meaningful when a TP Browser process mutates a
-- number via service_role; client writes are blocked by RLS). The
-- function skips rows not authored in TubeGhost (sync_source guard), so
-- this trigger is safe to have always on.
--
-- We call pg_net's net.http_post() DIRECTLY rather than the
-- supabase_functions.http_request() wrapper, so this migration does NOT
-- require the dashboard "Database Webhooks" feature to be enabled — only
-- the pg_net extension.
--
-- Placeholders (edit before apply, or psql \set):
--   :FUNCTIONS_BASE  e.g. https://kyolnnzjhzwjnssijhlo.functions.supabase.co
--   :SYNC_SECRET     the SYNC_WEBHOOK_SECRET value
-- Re-runnable.
-- ===================================================================

-- pg_net installs into the `net` schema on Supabase.
create extension if not exists pg_net;

-- Trigger function: POST the changed row to the edge function in the same
-- {type,table,schema,record,old_record} shape the sync functions expect.
-- SECURITY DEFINER + empty search_path per house rules; net.* is
-- fully-qualified.
create or replace function public.sync_phone_number_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url     := ':FUNCTIONS_BASE/sync-phone-number',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', ':SYNC_SECRET'
    ),
    body    := jsonb_build_object(
      'type', tg_op,
      'table', 'phone_numbers',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    )
  );
  return new;
end;
$$;

revoke all on function public.sync_phone_number_notify() from public, anon, authenticated;

drop trigger if exists sync_phone_number_out on public.phone_numbers;
create trigger sync_phone_number_out
  after update on public.phone_numbers
  for each row execute function public.sync_phone_number_notify();
