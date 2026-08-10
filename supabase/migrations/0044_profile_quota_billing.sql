-- ===================================================================
-- 0044 — Purchased quota columns for TubeGhost profile plans
-- ===================================================================
-- TubeGhost sells profiles on a GRADUATED (tax-bracket) tier table, so a
-- customer buys an arbitrary quantity — 25, 137, 400 — not one of a fixed
-- set of plans. `plans.profile_limit` can only express a fixed number per
-- plan_key, so it cannot represent that.
--
-- Rather than invent a plan row per quantity, we store the purchased
-- quantity on the workspace and let it OVERRIDE the plan's limit. Null =
-- no purchased quota, fall back to plans.profile_limit (the existing free
-- tier keeps working untouched).
--
-- These columns are billing state: writable ONLY by service_role from the
-- Stripe webhook, enforced by the same trigger pattern that already guards
-- workspaces.plan and workspaces.stripe_* (0002 §billing).
--
-- Numbered 0044 to clear both repos' highest migration (0043) per the
-- shared-Supabase numbering rule. Re-runnable.
-- ===================================================================

-- ── 1. Quota columns ───────────────────────────────────────────────
alter table public.workspaces
  add column if not exists profile_quota int,
  add column if not exists seat_quota    int,
  -- The TubeGhost subscription backing the quota above. Distinct from any
  -- TubeProxies subscription the same customer holds — one Stripe account
  -- serves both products, so we must not confuse them.
  add column if not exists tubeghost_subscription_id text,
  add column if not exists tubeghost_plan_key        text;

-- Quotas are counts; a negative one would silently disable the limit check.
alter table public.workspaces
  drop constraint if exists workspaces_profile_quota_nonneg;
alter table public.workspaces
  add constraint workspaces_profile_quota_nonneg
  check (profile_quota is null or profile_quota >= 0);

alter table public.workspaces
  drop constraint if exists workspaces_seat_quota_nonneg;
alter table public.workspaces
  add constraint workspaces_seat_quota_nonneg
  check (seat_quota is null or seat_quota >= 0);

-- One workspace per TubeGhost subscription — prevents a duplicated webhook
-- delivery from attaching the same subscription to two workspaces.
create unique index if not exists workspaces_tubeghost_subscription_id_key
  on public.workspaces (tubeghost_subscription_id)
  where tubeghost_subscription_id is not null;

-- ── 2. Limit checks read the quota first ───────────────────────────
-- coalesce(quota, plans.<limit>): a workspace that has bought profiles uses
-- its purchased number; everyone else keeps the plan-table behaviour.
create or replace function enforce_profile_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan  text;
  v_quota int;
  v_count int;
  v_limit int;
begin
  select plan, profile_quota into v_plan, v_quota
    from public.workspaces where id = new.workspace_id;
  select profile_limit into v_limit from public.plans where plan_key = v_plan;

  -- A purchased quota stands on its own: if the workspace has one we do NOT
  -- require its plan_key to exist in the plans table.
  v_limit := coalesce(v_quota, v_limit);
  if v_limit is null then
    raise exception 'Unknown plan: %', v_plan using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.profiles where workspace_id = new.workspace_id;
  if v_count >= v_limit then
    raise exception 'Plan limit reached: % of %', v_count, v_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function enforce_member_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan  text;
  v_quota int;
  v_count int;
  v_limit int;
begin
  select plan, seat_quota into v_plan, v_quota
    from public.workspaces where id = new.workspace_id;
  select member_seat_limit into v_limit from public.plans where plan_key = v_plan;

  v_limit := coalesce(v_quota, v_limit);
  if v_limit is null then
    raise exception 'Unknown plan: %', v_plan using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.workspace_members where workspace_id = new.workspace_id;
  if v_count >= v_limit then
    raise exception 'Member seat limit reached: % of %', v_count, v_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ── 3. Users must not grant themselves quota ───────────────────────
-- Same rule as workspaces.plan / stripe_*: only service_role (the Stripe
-- webhook) may write these. Without this, anyone with
-- workspace.edit_settings could set profile_quota = 1000000 via PostgREST
-- and bypass billing entirely.
create or replace function block_quota_column_updates()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- postgres/supabase_admin retained for dev + migrations, matching the
  -- existing billing-column trigger.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if new.profile_quota is distinct from old.profile_quota
     or new.seat_quota is distinct from old.seat_quota
     or new.tubeghost_subscription_id is distinct from old.tubeghost_subscription_id
     or new.tubeghost_plan_key is distinct from old.tubeghost_plan_key then
    raise exception 'Quota columns are billing-managed and cannot be edited'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists block_quota_column_updates on public.workspaces;
create trigger block_quota_column_updates
  before update on public.workspaces
  for each row execute function block_quota_column_updates();

-- Pin on INSERT too — otherwise a user creating a workspace could seed it
-- with a quota (mirrors pin_billing_columns_on_insert).
create or replace function pin_quota_columns_on_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  new.profile_quota := null;
  new.seat_quota := null;
  new.tubeghost_subscription_id := null;
  new.tubeghost_plan_key := null;
  return new;
end;
$$;

drop trigger if exists pin_quota_columns_on_insert on public.workspaces;
create trigger pin_quota_columns_on_insert
  before insert on public.workspaces
  for each row execute function pin_quota_columns_on_insert();

notify pgrst, 'reload schema';
