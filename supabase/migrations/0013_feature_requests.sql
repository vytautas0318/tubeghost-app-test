-- 0013: feature_requests — backing table for the sidebar "Request a feature"
-- popover (lightbulb next to RESOURCES). Append-only from the app; read back
-- by the requester only. Ops reads/exports happen via service_role (bypasses
-- RLS — no policy needed, see CLAUDE.md).

create table feature_requests (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  -- Preserve the request if the account is deleted (renders as "Deleted user").
  user_id      uuid references auth.users (id) on delete set null,
  -- Requester-picked bucket (Profiles / Proxies / Phone numbers / …). Free text
  -- so the app's category list can grow without a migration.
  category     text,
  message      text not null check (char_length(message) between 1 and 4000),
  -- Route the user was on when they filed it (e.g. "#/profiles").
  page         text,
  created_at   timestamptz not null default now()
);

alter table feature_requests enable row level security;

-- RLS-checked columns need supporting indexes.
create index feature_requests_workspace_id_idx on feature_requests (workspace_id);
create index feature_requests_user_id_idx on feature_requests (user_id);

-- Any member of a workspace may file a request for that workspace, as themselves.
create policy "feature_requests.insert own" on feature_requests for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and workspace_id in (select user_workspace_ids())
  );

-- Requesters can read back what they filed.
create policy "feature_requests.select own" on feature_requests for select
  to authenticated
  using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
