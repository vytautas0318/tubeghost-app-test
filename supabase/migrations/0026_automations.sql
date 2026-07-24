-- ===================================================================
-- Automations feature — no-code flow builder + execution engine.
--
-- An `automation` is a workspace-synced flow: a trigger (manual / scheduled),
-- a profile scope (all / groups / specific profiles), and an ordered list of
-- steps (jsonb). The engine (renderer orchestration + main-process CDP drive,
-- see src/renderer/src/lib/automations/engine.ts and src/main/automations/)
-- opens each in-scope profile, routes its proxy, and executes the steps.
--
-- Permission gating (keys already seeded in 0017_roles_access_catalog.sql):
--   automations.view  → read list / flows / runs
--   automations.edit  → create / edit / duplicate / import / pause / run-now
--   automations.run   → delete + manage across the workspace (the "full" tier;
--                       see roles-access/permMap.ts automation_build ladder)
--
-- NOTE: gated on PERMISSIONS ONLY, not check_plan_feature() — there is no
-- 'automations' plan feature seeded, so a plan gate would reject every write.
-- If an 'automations' plan feature is added later, mirror the extensions
-- plan-gated policies (0002_full_schema.sql:461) here.
-- ===================================================================

-- ── workspaces: automation engine defaults (concurrency, caps, captcha) ──
-- jsonb column mirroring network_defaults / fingerprint_defaults. Gated by the
-- existing workspaces UPDATE policy (workspace.edit_settings). See lib/settings.ts
-- AutomationDefaults. Captcha key is the workspace's own solver credit, not an
-- app-wide secret, so the RLS-gated column is acceptable.
alter table workspaces
  add column if not exists automation_defaults jsonb not null default '{}'::jsonb;

-- ── automations: the flow definitions ─────────────────────────────
create table if not exists automations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  name         text not null,
  -- { type: 'manual'|'scheduled', schedule?, profileScope: 'all'|'groups'|'profiles' }
  trigger      jsonb not null default '{"type":"manual","profileScope":"all"}'::jsonb,
  -- ordered Step[]: [{ id, type, params, optional }]
  steps        jsonb not null default '[]'::jsonb,
  -- Active / Paused (the row toggle). Paused flows never fire on schedule.
  enabled      boolean not null default true,
  -- Last time the scheduler fired this flow (drives due-calculation).
  last_run_at  timestamptz,
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_automations_ws on automations(workspace_id);

drop trigger if exists automations_updated_at on automations;
create trigger automations_updated_at before update on automations
  for each row execute function set_updated_at();

-- ── automation_groups / automation_profiles: scope assignment ──────
-- Mirror the extension_* join tables. Present only when the trigger's
-- profileScope is 'groups' or 'profiles' respectively.
create table if not exists automation_groups (
  automation_id uuid references automations on delete cascade not null,
  group_id      uuid references groups      on delete cascade not null,
  workspace_id  uuid references workspaces  on delete cascade not null,
  created_at    timestamptz default now(),
  primary key (automation_id, group_id)
);
create index if not exists idx_automation_groups_auto on automation_groups(automation_id);
create index if not exists idx_automation_groups_group on automation_groups(group_id);
create index if not exists idx_automation_groups_ws on automation_groups(workspace_id);

create table if not exists automation_profiles (
  automation_id uuid references automations on delete cascade not null,
  profile_id    uuid references profiles    on delete cascade not null,
  workspace_id  uuid references workspaces  on delete cascade not null,
  created_at    timestamptz default now(),
  primary key (automation_id, profile_id)
);
create index if not exists idx_automation_profiles_auto on automation_profiles(automation_id);
create index if not exists idx_automation_profiles_profile on automation_profiles(profile_id);
create index if not exists idx_automation_profiles_ws on automation_profiles(workspace_id);

-- ── automation_runs: per-execution tracking ───────────────────────
create table if not exists automation_runs (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid references automations on delete cascade not null,
  workspace_id  uuid references workspaces  on delete cascade not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running'
    check (status in ('running', 'success', 'error', 'cancelled')),
  -- { profileId, status, stepLogs: [{ stepId, type, status, message, at }] }[]
  profile_results jsonb not null default '[]'::jsonb,
  -- auth.users id, or null when fired by the scheduler (see triggered_by_kind).
  triggered_by  uuid references auth.users on delete set null,
  triggered_by_kind text not null default 'user'
    check (triggered_by_kind in ('user', 'schedule'))
);
create index if not exists idx_automation_runs_auto on automation_runs(automation_id);
create index if not exists idx_automation_runs_ws on automation_runs(workspace_id);
create index if not exists idx_automation_runs_started on automation_runs(workspace_id, started_at desc);

-- ── RLS ────────────────────────────────────────────────────────────
alter table automations         enable row level security;
alter table automation_groups   enable row level security;
alter table automation_profiles enable row level security;
alter table automation_runs     enable row level security;

-- automations: view→read, edit→create/update, run→delete
create policy "automations read" on automations for select
  using (check_user_permission((select auth.uid()), 'automations.view', workspace_id));
create policy "automations create" on automations for insert
  with check (check_user_permission((select auth.uid()), 'automations.edit', workspace_id));
create policy "automations edit" on automations for update
  using (check_user_permission((select auth.uid()), 'automations.edit', workspace_id))
  with check (check_user_permission((select auth.uid()), 'automations.edit', workspace_id));
create policy "automations delete" on automations for delete
  using (check_user_permission((select auth.uid()), 'automations.run', workspace_id));

-- Assignment join tables mirror the parent: read needs automations.view,
-- writing an assignment is an edit of the automation.
create policy "automation_groups read" on automation_groups for select
  using (check_user_permission((select auth.uid()), 'automations.view', workspace_id));
create policy "automation_groups write" on automation_groups for insert
  with check (check_user_permission((select auth.uid()), 'automations.edit', workspace_id));
create policy "automation_groups delete" on automation_groups for delete
  using (check_user_permission((select auth.uid()), 'automations.edit', workspace_id));

create policy "automation_profiles read" on automation_profiles for select
  using (check_user_permission((select auth.uid()), 'automations.view', workspace_id));
create policy "automation_profiles write" on automation_profiles for insert
  with check (check_user_permission((select auth.uid()), 'automations.edit', workspace_id));
create policy "automation_profiles delete" on automation_profiles for delete
  using (check_user_permission((select auth.uid()), 'automations.edit', workspace_id));

-- Runs: viewable by anyone who can view automations; created + finalized by
-- anyone who can edit (running a flow writes a run row + step-log updates).
create policy "automation_runs read" on automation_runs for select
  using (check_user_permission((select auth.uid()), 'automations.view', workspace_id));
create policy "automation_runs create" on automation_runs for insert
  with check (check_user_permission((select auth.uid()), 'automations.edit', workspace_id));
create policy "automation_runs update" on automation_runs for update
  using (check_user_permission((select auth.uid()), 'automations.edit', workspace_id))
  with check (check_user_permission((select auth.uid()), 'automations.edit', workspace_id));

notify pgrst, 'reload schema';
