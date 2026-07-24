-- ===================================================================
-- 0035 — Service-side upsert RPCs for the sync edge functions
-- ===================================================================
-- The sync-proxy-status and sync-phone-number functions call these
-- SECURITY DEFINER RPCs (via service_role) instead of raw table writes,
-- so that:
--   * workspace resolution for a purchased proxy lives in ONE place,
--   * the "purchased proxies land as source='tubeproxies'" invariant is
--     enforced server-side (a synced proxy can NEVER be 'custom'),
--   * everything is idempotent on the shared TubeProxies id.
--
-- These are internal (revoked from authenticated); only service_role
-- (edge functions) invokes them, and service_role bypasses grants.
-- Re-runnable.
-- ===================================================================

-- ── purchased proxy upsert (TubeProxies proxy_inventory -> proxies) ─
-- Resolves the buyer's TP Browser workspace (the workspace they own),
-- then upserts a source='tubeproxies' row keyed on (workspace_id,
-- tubeproxies_id). Lands UNASSIGNED to any browser profile (proxy_id on
-- profiles is untouched). If the buyer has no mirrored user / workspace
-- yet, raises so the caller queues it for retry (the mirror-user webhook
-- will create the workspace shortly).
create or replace function public.sync_upsert_purchased_proxy(
  p_tubeproxies_id uuid,
  p_buyer_user_id  uuid,
  p_proxy_type     text,
  p_host           text,
  p_port           integer,
  p_username       text,
  p_password       text,
  p_status         text,
  p_country_code   text default null,
  p_country_name   text default null,
  p_city           text default null,
  p_region         text default null,
  p_timezone       text default null,
  p_expires_at     timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws_id   uuid;
  v_proxy_id uuid;
begin
  if p_buyer_user_id is null then
    raise exception 'buyer user id is required' using errcode = '22023';
  end if;

  -- The buyer's workspace = the workspace they own. (v1: one workspace
  -- per user, created by provision_mirrored_user.)
  select w.id into v_ws_id
  from public.workspaces w
  where w.owner_id = p_buyer_user_id
  order by w.created_at nulls last
  limit 1;

  if v_ws_id is null then
    -- Not mirrored/provisioned yet — signal retry.
    raise exception 'no workspace for buyer % (mirror pending)', p_buyer_user_id
      using errcode = 'P0001';
  end if;

  insert into public.proxies (
    workspace_id, source, tubeproxies_id, tubeproxies_ip_id,
    proxy_type, host, port, username, password_encrypted,
    country_code, country_name, city, region, timezone,
    status, expires_at, synced_at, last_synced_at
  ) values (
    v_ws_id, 'tubeproxies', p_tubeproxies_id, p_tubeproxies_id::text,
    p_proxy_type, p_host, p_port, p_username, p_password,
    p_country_code, p_country_name, p_city, p_region, p_timezone,
    coalesce(p_status, 'active'), p_expires_at, now(), now()
  )
  on conflict (workspace_id, tubeproxies_id) where tubeproxies_id is not null
  do update set
    proxy_type          = excluded.proxy_type,
    host                = excluded.host,
    port                = excluded.port,
    username            = excluded.username,
    password_encrypted  = excluded.password_encrypted,
    country_code        = excluded.country_code,
    country_name        = excluded.country_name,
    city                = excluded.city,
    region              = excluded.region,
    timezone            = excluded.timezone,
    status              = excluded.status,
    expires_at          = excluded.expires_at,
    synced_at           = now(),
    last_synced_at      = now()
  returning id into v_proxy_id;

  return v_proxy_id;
end;
$$;

revoke all on function public.sync_upsert_purchased_proxy(
  uuid, uuid, text, text, integer, text, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;

-- ── phone-number upsert (shared uuid PK, loop-safe) ────────────────
-- Idempotent on id. sync_source records the AUTHORING project so a
-- status change we push back doesn't re-trigger our own inbound webhook.
-- Only updates when incoming state actually differs (content guard).
create or replace function public.sync_upsert_phone_number(
  p_id            uuid,
  p_user_id       uuid,
  p_phone_number  text,
  p_status        text,
  p_service_type  text default null,
  p_label         text default null,
  p_provisioned_at timestamptz default null,
  p_expires_at    timestamptz default null,
  p_released_at   timestamptz default null,
  p_sync_source   text default 'tubeproxies'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws_id uuid;
begin
  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'no mirrored user % for phone number (mirror pending)', p_user_id
      using errcode = 'P0001';
  end if;

  select w.id into v_ws_id
  from public.workspaces w where w.owner_id = p_user_id
  order by w.created_at nulls last limit 1;

  insert into public.phone_numbers (
    id, user_id, workspace_id, phone_number, status, service_type, label,
    provisioned_at, expires_at, released_at, sync_source, last_synced_at
  ) values (
    p_id, p_user_id, v_ws_id, p_phone_number, p_status, p_service_type, p_label,
    p_provisioned_at, p_expires_at, p_released_at, coalesce(p_sync_source, 'tubeproxies'), now()
  )
  on conflict (id) do update set
    phone_number   = excluded.phone_number,
    status         = excluded.status,
    service_type   = excluded.service_type,
    label          = excluded.label,
    provisioned_at = excluded.provisioned_at,
    expires_at     = excluded.expires_at,
    released_at    = excluded.released_at,
    sync_source    = excluded.sync_source,
    last_synced_at = now()
  where
    -- content guard: skip a write that changes nothing (loop prevention)
    public.phone_numbers.status        is distinct from excluded.status
    or public.phone_numbers.phone_number is distinct from excluded.phone_number
    or public.phone_numbers.label        is distinct from excluded.label
    or public.phone_numbers.service_type is distinct from excluded.service_type
    or public.phone_numbers.expires_at   is distinct from excluded.expires_at
    or public.phone_numbers.released_at  is distinct from excluded.released_at;

  return p_id;
end;
$$;

revoke all on function public.sync_upsert_phone_number(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) from public, anon, authenticated;

notify pgrst, 'reload schema';
