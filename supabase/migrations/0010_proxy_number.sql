-- ===================================================================
-- proxies.proxy_number — workspace-scoped ordinal for the Proxies
-- table (#1, #2, #3, ...). Same pattern as profiles.profile_number
-- (migration 0009): renderer surfaces the number for visual scanning,
-- it's per-workspace not global so the numbering is meaningful in
-- each workspace's context.
-- ===================================================================

alter table public.proxies
  add column if not exists proxy_number int;

-- Trigger: assign next ordinal at INSERT when proxy_number is null.
-- Mirrors assign_profile_number — see migration 0009 for reasoning
-- on why this is safe under concurrent inserts at our scale, plus
-- the unique partial index below as defense-in-depth.
create or replace function assign_proxy_number()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  if new.proxy_number is null then
    select coalesce(max(proxy_number), 0) + 1
      into new.proxy_number
      from public.proxies
     where workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;

drop trigger if exists proxies_assign_number on public.proxies;
create trigger proxies_assign_number
  before insert on public.proxies
  for each row execute function assign_proxy_number();

-- Backfill existing rows. row_number() partitions per workspace and
-- orders by created_at so the oldest proxy gets #1.
with numbered as (
  select id,
         row_number() over (partition by workspace_id order by created_at) as n
    from public.proxies
   where proxy_number is null
)
update public.proxies p
   set proxy_number = numbered.n
  from numbered
 where p.id = numbered.id;

-- Defense in depth: prevent two proxies in the same workspace from
-- ending up with the same number even if a future code path bypasses
-- the trigger.
create unique index if not exists idx_proxies_workspace_number
  on public.proxies (workspace_id, proxy_number)
  where proxy_number is not null;

notify pgrst, 'reload schema';
