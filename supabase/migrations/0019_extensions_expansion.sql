-- ===================================================================
-- Extensions feature expansion.
--
-- The 0001 `extensions` table was a stub (name/version/source/path). The
-- Extensions page (central library synced/assigned across profiles, à la
-- AdsPower / Multilogin) needs richer metadata + an assignment model.
--
-- File storage is LOCAL-FIRST: the actual unpacked extension files live at
-- <userData>/extensions/<id>/ on each device (owned by the main process,
-- see engine/extension-store.ts). This table is the workspace-synced
-- SOURCE OF TRUTH for *which* extensions exist, their metadata, and where
-- they're assigned; a device missing the files re-fetches them from the
-- Web Store (web_store_id) or prompts a re-upload (crx_upload).
--
-- RBAC + plan gating for the parent `extensions` table already exists
-- (0002_full_schema.sql:461-481). This migration adds the new columns and
-- the two assignment join tables with mirrored RLS.
-- ===================================================================

-- ── extensions: new columns ───────────────────────────────────────
alter table extensions
  add column if not exists publisher        text,
  add column if not exists web_store_id     text,
  add column if not exists icon_data_url    text,
  add column if not exists category         text,
  -- Derived from the manifest (see engine/extension-store.ts). One of
  -- 'minimal' | 'limited' | 'broad'. Not user-entered.
  add column if not exists permission_scope text
    check (permission_scope in ('minimal', 'limited', 'broad')),
  add column if not exists manifest         jsonb,
  -- Global on/off. Disabled extensions never load into any profile.
  add column if not exists enabled          boolean not null default true,
  -- 'all'    → every profile in the workspace loads it
  -- 'groups' → profiles in the assigned groups (extension_groups)
  -- 'profiles' → the specifically-assigned profiles (extension_profiles)
  -- 'none'   → assigned to nothing
  add column if not exists assign_mode      text not null default 'none'
    check (assign_mode in ('all', 'groups', 'profiles', 'none')),
  add column if not exists updated_at        timestamptz not null default now();

-- storage_path was NOT NULL in 0001; for Web-Store rows we default it to
-- the row id (the local-store folder name) via the app, but relax it here
-- so an insert that sets it after id-generation is possible.
alter table extensions alter column storage_path drop not null;

-- Broaden the source_type check to the names the feature uses.
alter table extensions drop constraint if exists extensions_source_type_check;
alter table extensions add constraint extensions_source_type_check
  check (source_type in ('webstore', 'web_store', 'crx_upload', 'unpacked'));

drop trigger if exists extensions_updated_at on extensions;
create trigger extensions_updated_at before update on extensions
  for each row execute function set_updated_at();

-- ── extension_profiles: specific-profile assignment ───────────────
create table if not exists extension_profiles (
  extension_id uuid references extensions on delete cascade not null,
  profile_id   uuid references profiles   on delete cascade not null,
  workspace_id uuid references workspaces on delete cascade not null,
  created_at   timestamptz default now(),
  primary key (extension_id, profile_id)
);
create index if not exists idx_extension_profiles_ext on extension_profiles(extension_id);
create index if not exists idx_extension_profiles_profile on extension_profiles(profile_id);
create index if not exists idx_extension_profiles_ws on extension_profiles(workspace_id);

-- ── extension_groups: group assignment ────────────────────────────
create table if not exists extension_groups (
  extension_id uuid references extensions on delete cascade not null,
  group_id     uuid references groups     on delete cascade not null,
  workspace_id uuid references workspaces on delete cascade not null,
  created_at   timestamptz default now(),
  primary key (extension_id, group_id)
);
create index if not exists idx_extension_groups_ext on extension_groups(extension_id);
create index if not exists idx_extension_groups_group on extension_groups(group_id);
create index if not exists idx_extension_groups_ws on extension_groups(workspace_id);

alter table extension_profiles enable row level security;
alter table extension_groups   enable row level security;

-- Assignment rows mirror the parent extension's permissions: reading needs
-- profiles.view; writing an assignment is an "edit" of the extension.
create policy "extension_profiles read" on extension_profiles for select
  using (check_user_permission((select auth.uid()), 'profiles.view', workspace_id));
create policy "extension_profiles write" on extension_profiles for insert
  with check (
    check_user_permission((select auth.uid()), 'extensions.edit', workspace_id)
    and check_plan_feature(workspace_id, 'extensions')
  );
create policy "extension_profiles delete" on extension_profiles for delete
  using (check_user_permission((select auth.uid()), 'extensions.edit', workspace_id));

create policy "extension_groups read" on extension_groups for select
  using (check_user_permission((select auth.uid()), 'profiles.view', workspace_id));
create policy "extension_groups write" on extension_groups for insert
  with check (
    check_user_permission((select auth.uid()), 'extensions.edit', workspace_id)
    and check_plan_feature(workspace_id, 'extensions')
  );
create policy "extension_groups delete" on extension_groups for delete
  using (check_user_permission((select auth.uid()), 'extensions.edit', workspace_id));

notify pgrst, 'reload schema';
