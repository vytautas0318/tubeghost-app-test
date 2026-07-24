-- ===================================================================
-- 0020_workspace_tags.sql
-- Workspace-scoped tag registry with a user-chosen color.
--
-- Until now "tags" were just string members of profiles.tags /
-- authenticator_tokens.tags (text[]), and each tag's COLOR was derived
-- from its name (a frontend hash / fixed list) — users could not pick or
-- edit a color. This adds a real tag entity so a tag has a stored color
-- that both the Profiles and Authenticator features read by name.
--
-- Design: tags are still referenced by NAME in the existing text[] columns
-- (no data migration, existing arrays keep working). This table is the
-- color source of truth; a name absent here falls back to the old hash in
-- the frontend. (workspace_id, lower(name)) is unique so a tag is one row.
--
-- Permission keys already exist (seeded in 0002): tags.create / tags.edit /
-- tags.delete. This migration finally gives them a table + RLS to gate.
-- ===================================================================

-- 1. tags table -------------------------------------------------------
create table tags (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name         text not null,
  -- Hex color chosen from the preset swatch palette (mirrors groups.color).
  color        text not null default '#6366f1',
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now()
);

-- One tag per name per workspace, case-insensitive (tags are matched by the
-- lowercased name against the text[] members).
create unique index idx_tags_workspace_name on tags (workspace_id, lower(name));
create index idx_tags_workspace on tags (workspace_id);

-- 2. RLS --------------------------------------------------------------
alter table tags enable row level security;

-- View the registry → any member who can see profiles (tags decorate them).
-- We gate on tags.create for write and a broad read; reading a color leaks
-- nothing sensitive, so SELECT rides the same view surface as groups.
create policy "tags.view" on tags for select
  using (check_user_permission((select auth.uid()), 'groups.view', workspace_id));

create policy "tags.create" on tags for insert
  with check (check_user_permission((select auth.uid()), 'tags.create', workspace_id));

create policy "tags.edit" on tags for update
  using (check_user_permission((select auth.uid()), 'tags.edit', workspace_id))
  with check (check_user_permission((select auth.uid()), 'tags.edit', workspace_id));

create policy "tags.delete" on tags for delete
  using (check_user_permission((select auth.uid()), 'tags.delete', workspace_id));

-- 3. Seed the six legacy preset tags per existing workspace so their colors
-- match what the old frontend hash produced (flagship=red, warm=amber,
-- clips=blue, ecom=violet, new=green, official=neutral). Idempotent.
insert into public.tags (workspace_id, name, color)
select w.id, t.name, t.color
from public.workspaces w
cross join (values
  ('flagship', '#E60000'),
  ('warm',     '#F59E0B'),
  ('clips',    '#3B82F6'),
  ('ecom',     '#8B5CF6'),
  ('new',      '#10B981'),
  ('official', '#6B7280')
) as t(name, color)
on conflict do nothing;

-- 4. Reload PostgREST schema cache ------------------------------------
notify pgrst, 'reload schema';
