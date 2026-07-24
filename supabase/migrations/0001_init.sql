-- ===================================================================
-- TubeProxies Browser — initial schema (PLAN.md §8 + §6.2.3.1).
-- Run via: npx supabase db push  (or paste into Supabase SQL Editor).
-- ===================================================================

-- Workspaces ---------------------------------------------------------
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users not null,
  plan text default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  default_browser_version text default '142',
  default_extensions uuid[] default '{}',
  tubeproxies_api_key_encrypted text,
  -- Launch safeguards (§6.2.3.1) — admin-only writes, default ON.
  safeguard_block_concurrent boolean not null default true,
  safeguard_verify_proxy boolean not null default true,
  safeguard_block_on_proxy_failure boolean not null default true,
  safeguard_block_on_egress_mismatch boolean not null default true,
  created_at timestamptz default now()
);

-- Workspace members --------------------------------------------------
create table workspace_members (
  workspace_id uuid references workspaces on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text check (role in ('owner', 'admin', 'manager', 'viewer')) not null,
  invited_by uuid references auth.users,
  joined_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- Only one Owner per workspace (enforced at DB level — see PLAN §6.5).
create unique index workspace_members_one_owner
  on workspace_members (workspace_id) where role = 'owner';

-- Groups -------------------------------------------------------------
create table groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  name text not null,
  color text default '#6366f1',
  created_at timestamptz default now()
);

-- Profiles -----------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  group_id uuid references groups on delete set null,
  name text not null,
  fingerprint_seed integer not null,
  platform text default 'windows',
  platform_version text default '10.0.0',
  brand text default 'Chrome',
  brand_version text default '142',
  hardware_concurrency integer default 8,
  device_memory integer default 8,
  webgl_vendor text,
  webgl_renderer text,
  language text default 'en-US',
  timezone text default 'America/New_York',
  window_width integer default 1440,
  window_height integer default 900,
  user_agent text,
  proxy_type text,
  proxy_host text,
  proxy_port integer,
  proxy_user text,
  proxy_pass text,
  proxy_source text default 'manual',
  tubeproxies_ip_id text,
  notes text,
  tags text[] default '{}',
  assigned_to uuid references auth.users,
  enabled_extensions uuid[] default '{}',
  created_by uuid references auth.users,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_opened_at timestamptz,
  last_opened_by uuid references auth.users,
  -- Concurrent-open lock (Safeguard A).
  open_session_id uuid,
  open_by_user_id uuid references auth.users,
  open_by_device text,
  open_at timestamptz,
  open_heartbeat_at timestamptz,
  -- Proxy precheck (Safeguard B).
  last_known_egress_ip inet
);

-- Extensions ---------------------------------------------------------
create table extensions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  name text not null,
  version text,
  description text,
  source_type text check (source_type in ('webstore', 'crx_upload', 'unpacked')),
  source_url text,
  storage_path text not null,
  auto_install_default boolean default false,
  created_at timestamptz default now()
);

-- Activity log -------------------------------------------------------
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  user_id uuid references auth.users,
  profile_id uuid references profiles on delete set null,
  action text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Indexes ------------------------------------------------------------
create index idx_profiles_workspace on profiles(workspace_id);
create index idx_profiles_group on profiles(group_id);
create index idx_profiles_tags on profiles using gin(tags);
create index idx_members_user on workspace_members(user_id);
create index idx_activity_workspace on activity_log(workspace_id, created_at desc);
create index idx_extensions_workspace on extensions(workspace_id);
create index idx_profiles_open_lock on profiles(open_session_id) where open_session_id is not null;

-- updated_at trigger -------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- ===================================================================
-- Lock down default function privileges (deny-by-default).
-- Without this, every helper below is callable by `anon` via PostgREST.
-- ===================================================================
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- ===================================================================
-- RLS
-- ===================================================================
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table groups enable row level security;
alter table profiles enable row level security;
alter table extensions enable row level security;
alter table activity_log enable row level security;

-- Helper: workspaces the caller belongs to. SECURITY DEFINER + empty
-- search_path is mandatory: prevents search_path injection where a
-- malicious schema shadows public.workspace_members.
create or replace function user_workspace_ids()
returns setof uuid
language sql security definer stable set search_path = '' as $$
  select workspace_id from public.workspace_members where user_id = auth.uid()
$$;
grant execute on function user_workspace_ids() to authenticated;

-- Helper: caller's role in a given workspace. Used by all "manage"
-- policies to avoid 42P17 self-referential RLS recursion on workspace_members.
create or replace function user_workspace_role(wid uuid)
returns text
language sql security definer stable set search_path = '' as $$
  select role from public.workspace_members
  where workspace_id = wid and user_id = auth.uid()
$$;
grant execute on function user_workspace_role(uuid) to authenticated;

-- Workspaces policies
create policy "members read workspaces" on workspaces for select
  using (id in (select user_workspace_ids()));
create policy "owners update workspaces" on workspaces for update
  using (owner_id = auth.uid());
create policy "users create workspaces" on workspaces for insert
  with check (owner_id = auth.uid());

-- Members policies — uses helper to avoid recursion.
create policy "members read members" on workspace_members for select
  using (workspace_id in (select user_workspace_ids()));
create policy "admins manage members" on workspace_members for all
  using (user_workspace_role(workspace_id) in ('owner', 'admin'))
  with check (user_workspace_role(workspace_id) in ('owner', 'admin'));

-- Groups policies
create policy "members read groups" on groups for select
  using (workspace_id in (select user_workspace_ids()));
create policy "managers manage groups" on groups for all
  using (user_workspace_role(workspace_id) in ('owner', 'admin', 'manager'))
  with check (user_workspace_role(workspace_id) in ('owner', 'admin', 'manager'));

-- Profiles policies
create policy "members read profiles" on profiles for select
  using (workspace_id in (select user_workspace_ids()));
create policy "managers write profiles" on profiles for all
  using (user_workspace_role(workspace_id) in ('owner', 'admin', 'manager'))
  with check (user_workspace_role(workspace_id) in ('owner', 'admin', 'manager'));

-- Extensions policies
create policy "members read extensions" on extensions for select
  using (workspace_id in (select user_workspace_ids()));
create policy "managers manage extensions" on extensions for all
  using (user_workspace_role(workspace_id) in ('owner', 'admin', 'manager'))
  with check (user_workspace_role(workspace_id) in ('owner', 'admin', 'manager'));

-- Activity log policies. Insert is pinned to user_id = auth.uid() so
-- members cannot spoof another user's actions in the audit trail.
create policy "members read activity" on activity_log for select
  using (workspace_id in (select user_workspace_ids()));
create policy "members write activity" on activity_log for insert
  with check (
    workspace_id in (select user_workspace_ids())
    and user_id = auth.uid()
  );

-- ===================================================================
-- Plan-limit enforcement (server-side, non-bypassable).
-- Update the limits when pricing changes. PLACEHOLDER VALUES — confirm
-- against real Stripe tiers before launch (PLAN.md §6.6).
-- ===================================================================
create or replace function enforce_profile_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
  v_count int;
  v_limit int;
begin
  select plan into v_plan from public.workspaces where id = new.workspace_id;
  select count(*) into v_count from public.profiles where workspace_id = new.workspace_id;
  v_limit := case v_plan
    when 'free' then 5
    when 'pro' then 100
    when 'team' then 1000
    else 0
  end;
  if v_count >= v_limit then
    raise exception 'Plan limit reached for workspace % on plan %: % of %',
      new.workspace_id, v_plan, v_count, v_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_plan_limit before insert on profiles
  for each row execute function enforce_profile_limit();

create or replace function enforce_member_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
  v_count int;
  v_limit int;
begin
  select plan into v_plan from public.workspaces where id = new.workspace_id;
  select count(*) into v_count from public.workspace_members where workspace_id = new.workspace_id;
  v_limit := case v_plan
    when 'free' then 1
    when 'pro' then 3
    when 'team' then 25
    else 0
  end;
  if v_count >= v_limit then
    raise exception 'Member seat limit reached for workspace % on plan %: % of %',
      new.workspace_id, v_plan, v_count, v_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger workspace_members_seat_limit before insert on workspace_members
  for each row execute function enforce_member_limit();

-- ===================================================================
-- Auto-create workspace on signup
-- ===================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ws_id uuid;
  v_ws_name text;
begin
  v_ws_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'workspace_name'), ''),
    'My Workspace'
  );
  if length(v_ws_name) > 80 then
    v_ws_name := left(v_ws_name, 80);
  end if;
  insert into public.workspaces (name, owner_id)
  values (v_ws_name, new.id)
  returning id into v_ws_id;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_ws_id, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ===================================================================
-- Concurrent-open lock RPCs (Safeguard A, §6.2.3.1)
-- Stale-lock threshold: 60 seconds (heartbeats fire every 30s).
-- ===================================================================
create or replace function try_acquire_profile_lock(
  p_profile_id uuid,
  p_session_id uuid,
  p_device text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_workspace_id uuid;
  v_held_session uuid;
  v_held_user uuid;
  v_held_device text;
  v_held_since timestamptz;
  v_held_heartbeat timestamptz;
begin
  select workspace_id into v_workspace_id from public.profiles where id = p_profile_id;
  if v_workspace_id is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_workspace_id and user_id = auth.uid()
  ) then
    raise exception 'access denied' using errcode = '42501';
  end if;

  update public.profiles
     set open_session_id = p_session_id,
         open_by_user_id = auth.uid(),
         open_by_device  = p_device,
         open_at         = now(),
         open_heartbeat_at = now()
   where id = p_profile_id
     and (open_session_id is null
          or open_heartbeat_at < now() - interval '60 seconds');

  if found then
    return jsonb_build_object('acquired', true);
  end if;

  select open_session_id, open_by_user_id, open_by_device, open_at, open_heartbeat_at
    into v_held_session, v_held_user, v_held_device, v_held_since, v_held_heartbeat
    from public.profiles where id = p_profile_id;

  return jsonb_build_object(
    'acquired', false,
    'held_by_user', v_held_user,
    'held_by_device', v_held_device,
    'held_since', v_held_since,
    'last_heartbeat', v_held_heartbeat
  );
end;
$$;
grant execute on function try_acquire_profile_lock(uuid, uuid, text) to authenticated;

create or replace function update_profile_heartbeat(
  p_profile_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set open_heartbeat_at = now()
   where id = p_profile_id
     and open_session_id = p_session_id;
  return found;
end;
$$;
grant execute on function update_profile_heartbeat(uuid, uuid) to authenticated;

create or replace function release_profile_lock(
  p_profile_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set open_session_id = null,
         open_by_user_id = null,
         open_by_device  = null,
         open_at         = null,
         open_heartbeat_at = null
   where id = p_profile_id
     and open_session_id = p_session_id;
  return found;
end;
$$;
grant execute on function release_profile_lock(uuid, uuid) to authenticated;

create or replace function force_release_profile_lock(p_profile_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.profiles where id = p_profile_id;
  if v_workspace_id is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if public.user_workspace_role(v_workspace_id) not in ('owner','admin') then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  update public.profiles
     set open_session_id = null,
         open_by_user_id = null,
         open_by_device  = null,
         open_at         = null,
         open_heartbeat_at = null
   where id = p_profile_id;
  insert into public.activity_log (workspace_id, user_id, profile_id, action, metadata)
  values (v_workspace_id, auth.uid(), p_profile_id, 'force_unlocked',
          jsonb_build_object('forced_by', auth.uid()));
  return true;
end;
$$;
grant execute on function force_release_profile_lock(uuid) to authenticated;
