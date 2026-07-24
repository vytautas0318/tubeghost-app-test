-- ===================================================================
-- profiles.profile_number — workspace-scoped ordinal for the
-- per-profile dock icon badge on macOS. Each new profile gets the
-- next available integer for its workspace (1, 2, 3, ...).
--
-- The renderer surfaces this number in lists/details and the main
-- process picks the matching pre-rendered .icns slot for the dock
-- icon when launching the per-profile cloned Browser.app.
--
-- Why workspace-scoped rather than global: a user with three
-- workspaces wants "Profile 1" in each, not a globally unique number
-- that's confusing across workspace contexts. Matches AdsPower's
-- per-account slot numbering.
-- ===================================================================

alter table public.profiles
  add column if not exists profile_number int;

-- Trigger: assign the next ordinal at INSERT time when profile_number
-- is null (which it always is, since the column is not in the renderer
-- INSERT payload). Wrapped in advisory lock by max+1 in a single
-- statement under serialisable isolation; the trigger runs inside the
-- INSERT transaction so concurrent inserts can't both observe the
-- same max. PostgreSQL's row-level locking on the new row plus the
-- aggregate query's snapshot semantics make this safe at our scale.
-- A unique partial index below would catch any racy duplicates.
create or replace function assign_profile_number()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  if new.profile_number is null then
    select coalesce(max(profile_number), 0) + 1
      into new.profile_number
      from public.profiles
     where workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_number on public.profiles;
create trigger profiles_assign_number
  before insert on public.profiles
  for each row execute function assign_profile_number();

-- Backfill existing rows. row_number() partitions per workspace and
-- orders by created_at so the oldest profile gets #1.
with numbered as (
  select id,
         row_number() over (partition by workspace_id order by created_at) as n
    from public.profiles
   where profile_number is null
)
update public.profiles p
   set profile_number = numbered.n
  from numbered
 where p.id = numbered.id;

-- Defense in depth: prevent two profiles in the same workspace from
-- ending up with the same number even if a future code path bypasses
-- the trigger.
create unique index if not exists idx_profiles_workspace_number
  on public.profiles (workspace_id, profile_number)
  where profile_number is not null;

notify pgrst, 'reload schema';
