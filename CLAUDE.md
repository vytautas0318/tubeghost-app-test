# Claude Code Guidelines for TubeProxies Browser

Electron + React + TypeScript + Supabase desktop app. Read this before
making any changes — it codifies hard-won patterns from 5 migrations and
~30 RPCs across the RBAC + plan-feature + audit-trail systems.

## Code Style — file size + structure

**Hard rule: max 250 lines per source file.** Applies to all `.tsx`/`.ts`
source code. The only exception is documentation files like `CLAUDE.md`,
`PLAN.md`, and `README.md` which are allowed to be longer.

When a source file approaches the limit, split into a folder beside the
page using this canonical pattern:

```
pages/<feature-name>/
  use<Feature>Data.ts     ← all Supabase queries + mutations + realtime
  <Feature>Header.tsx     ← page header
  <Feature>Empty.tsx      ← empty state
  <SubComponent>.tsx      ← one file per significant child
  parts.tsx               ← OPTIONAL: tiny shared helpers (KV, Section, etc.)
pages/<Feature>.tsx        ← thin orchestrator (~120-200 lines)
```

Look at the already-split features for canonical examples:
- `pages/proxies/` — table + filters + drawer + modal pattern
- `pages/settings/` — tabbed page pattern
- `pages/groups/` — CRUD-with-inline-edit pattern

**TypeScript strict.** No `any` without a justifying comment. All Supabase
queries typed via the `lib/<resource>.ts` data layer.

**Cross-feature shared helpers** go in `src/renderer/src/components/`
(see `Toast.tsx` / `BrandLogo.tsx`), not duplicated per feature.

## Permission Checking Functions (RBAC)

**The ONE canonical RLS helper:**
```sql
check_user_permission(p_user_id uuid, p_permission_key text, p_workspace_id uuid)
-- defined in supabase/migrations/0002_full_schema.sql:191
```

**The ONE plan-feature helper:**
```sql
check_plan_feature(p_workspace_id uuid, p_feature_key text)
-- defined in supabase/migrations/0002_full_schema.sql:216
```

**NEVER check role names** (`'owner'`, `'admin'`) anywhere — neither in
RLS policies nor in renderer code. Always use permission keys. Roles are
configuration; permissions are the API.

**Always wrap `auth.uid()` in `(select auth.uid())`** inside RLS policy
expressions — Postgres evaluates the inner subquery once per query
instead of once per row. Critical at scale.

## RLS Policy Patterns + Anti-patterns

```sql
-- CORRECT — workspace-scoped resource
create policy "profiles.view" on profiles for select
  using (check_user_permission((select auth.uid()), 'profiles.view', workspace_id));

-- CORRECT — plan-gated action (combines permission + plan feature)
create policy "extensions.create plan-gated" on extensions for insert
  with check (
    check_user_permission((select auth.uid()), 'extensions.create', workspace_id)
    and check_plan_feature(workspace_id, 'extensions')
  );

-- WRONG — role-name check
using (exists (select 1 from workspace_members
              where user_id = auth.uid() and role = 'admin'))

-- WRONG — USING (true) without TO clause
create policy "anyone can read" on app_permissions for select using (true);

-- WRONG — self-referential subquery (recursion footgun)
create policy "members read members" on workspace_members for select
  using (workspace_id in (select workspace_id from workspace_members
                          where user_id = auth.uid()));
-- → use a SECURITY DEFINER helper to break recursion (we have user_workspace_ids())
```

Every policy MUST have a meaningful security check. `TO authenticated`
alone is not enough — also check the user's relationship to the row.

## SECURITY DEFINER + search_path

**Every** SECURITY DEFINER function must:
1. `SET search_path = ''` (no exceptions)
2. Fully-qualify table references: `public.workspaces`, never `workspaces`
3. Have an explicit `GRANT EXECUTE ... TO authenticated` (or stay revoked
   if internal-only — see `seed_default_roles`)

```sql
-- CORRECT
create or replace function check_user_permission(...)
returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.user_roles ur join public.role_permissions ...)
$$;
grant execute on function check_user_permission(uuid, text, uuid) to authenticated;
```

**Default-privilege revoke at top of init migration:**
```sql
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
```
Then explicitly grant per function. Default-grant-everything is the most
common Postgres footgun.

## Secrets management — where keys live

Three buckets, picked by who needs to read them:

| Kind | Where it goes | Example |
|---|---|---|
| **Public config** the renderer needs | `.env` with `VITE_` prefix → bundled into renderer | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (designed to be public; RLS protects data) |
| **Server-side secret** (real secret, app-wide) | **Supabase Edge Function secret** — `npx supabase secrets set NAME=value` | `IP2LOCATION_API_KEY`, future `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` |
| **Per-user secret** | DB column, encrypted via Supabase Vault | `workspaces.tubeproxies_api_key_encrypted` |

**Rule: a key with `VITE_` prefix is public.** Anyone who downloads the
Electron app can extract it from the bundle. If a key is a real secret,
it must NOT be in `VITE_*` and must NOT be hardcoded in main-process
code (still extractable from the `.app` / `.exe` bundle).

### Adding a new server-side secret

1. Create the Edge Function in `supabase/functions/<name>/index.ts`.
   Read the secret via `Deno.env.get('SECRET_NAME')`.
2. Set the secret: `npx supabase secrets set SECRET_NAME=value`.
3. Deploy: `npx supabase functions deploy <name>`.
4. Renderer calls `supabase.functions.invoke('<name>', { body: ... })`.
   The user's JWT goes along automatically; reject unauthenticated calls
   inside the function via `getUserIdFromRequest(req)` from `_shared/auth.ts`.

Existing examples to mirror: `supabase/functions/ip2location-lookup/`,
`supabase/functions/proxy-test/`.

### Local dev

For your own development you can put the secret in `.env` (no `VITE_`
prefix) and read it from main-process code temporarily — but production
must move it to Edge Function secrets before shipping. Better to skip the
shortcut and use Edge Functions from day one (see precedent: ip2location).

## Subscription / Billing Tables

`workspaces.plan` and `workspaces.stripe_*` columns are write-protected
by **two triggers**:
- `block_billing_column_updates` (BEFORE UPDATE)
- `pin_billing_columns_on_insert` (BEFORE INSERT)

Only `service_role` (Stripe webhook) — and `postgres` / `supabase_admin`
for dev — can change plan or stripe fields. Never add a UPDATE policy
that lets `authenticated` users change these columns.

A user with `workspace.edit_settings` permission can edit name/defaults/
safeguards, but the trigger blocks billing-column edits regardless.

## ON DELETE behavior on user FKs

Choose carefully — different rules for different relationships:

| FK | Behavior | Why |
|---|---|---|
| `workspace_members.user_id → auth.users` | `CASCADE` | Member row is meaningless without the user |
| `activity_log.user_id` | `SET NULL` | Audit trail must survive user deletion |
| `profiles.created_by` / `assigned_to` / `last_opened_by` / `open_by_user_id` | `SET NULL` | Same — preserve attribution |
| `workspace_members.invited_by` | `SET NULL` | Audit who invited whom |
| `user_roles.assigned_by` | `SET NULL` | Same |
| `workspaces.owner_id` | `CASCADE` | v1 simplicity (no transfer-ownership UI yet); v1.1 → `SET NULL` + transfer required |

**The CRITICAL one is `activity_log.user_id`.** Default `NO ACTION` would
make user deletion fail outright; `CASCADE` would silently delete the
user's audit history. Neither is acceptable. SET NULL renders as
"Deleted user" in the UI, preserves the row.

## Service Role Policies

**Never** create policies `TO service_role`. service_role bypasses RLS
entirely — adding policies for it is dead code that just clutters the
schema.

```sql
-- WRONG — pointless
create policy "service can do anything" on profiles for all
  to service_role using (true);
```

If a server-side process needs to mutate something users can't, use a
SECURITY DEFINER RPC and gate access inside the function.

## Frontend Permission Checks

```tsx
// CORRECT
const canCreate = useHasPermission('profiles.create')
const bulkAvailable = useFeatureEnabled('bulk')
{canCreate && bulkAvailable && <Button>New profile</Button>}

// CORRECT — disable with reason
<Button disabled={!canEdit} title={!canEdit ? "You don't have permission" : undefined}>
  Save
</Button>
```

Hooks live in `src/renderer/src/lib/permissions.ts`:
- `useHasPermission(key)` — exact permission
- `useHasAnyPermission(...keys)` — for nav items that match multiple
- `useFeatureEnabled(featureKey)` — plan gating

**RLS is the source of truth.** Frontend gates are UX only — never
trust them. Even if the user bypasses the UI (e.g. modifies the JS at
runtime, hits Supabase directly), RLS will still reject the operation.

## Plan / Resource Limits

**Backend** (always-enforced):
- `enforce_profile_limit` BEFORE INSERT trigger reads from `plans.profile_limit`
- `enforce_member_limit` BEFORE INSERT trigger reads from `plans.member_seat_limit`

Update plan numbers in `plans` table — triggers re-derive automatically.

**Frontend** (prevent-before-attempt):
- Disable the action button when at cap; never let users click and then
  show an error
- Show "X / Y used" indicator near the button
- Show upgrade banner when at limit
- Use `billing.manage` permission to decide between "Upgrade Plan" CTA
  vs. "Contact your admin to upgrade" message

## Migration SQL Standards

Pre-flight checklist for every new migration:

1. ☐ `SET search_path = ''` on every SECURITY DEFINER function
2. ☐ Fully-qualified table names (`public.x`) inside SECURITY DEFINER
3. ☐ Explicit `GRANT EXECUTE ... TO authenticated` (or intentionally revoked)
4. ☐ No raw `auth.uid()` in RLS policies — use `(select auth.uid())`
5. ☐ Every new table has `enable row level security`
6. ☐ Every RLS-checked column has a supporting index
7. ☐ No `USING (true)` policies — always a meaningful check
8. ☐ No `TO service_role` policies — use a SECURITY DEFINER RPC instead
9. ☐ User FKs follow the ON DELETE table above
10. ☐ Bottom of migration: `notify pgrst, 'reload schema';`

## Cross-workspace + cross-plan isolation

**Verified safe:** a user with workspace A's data CANNOT see workspace B's
data, even with a valid workspace B UUID. This was audit-tested across all
5 migrations. Don't introduce policies that bypass this.

Specifically:
- `seed_default_roles()` is **revoked** from `authenticated` — only callable
  inside `create_workspace()` and `handle_new_user()` SECURITY DEFINER
  wrappers. Granting it directly = privilege escalation.
- All workspace-scoped lookups go through `check_user_permission` which
  joins `user_roles` filtered by both `user_id` AND `workspace_id`.
- Triggers (`enforce_role_permission_workspace_consistency`,
  `enforce_user_role_workspace_consistency`) prevent inserting role grants
  that mismatch the role's actual workspace.

## Git workflow — DO NOT commit or push

The user handles all git commits and pushes manually. You MUST NOT run:

- `git commit` / `git commit -m ...`
- `git push` (especially never to `main`)
- `git merge`, `git rebase`, `git reset --hard`, `git push --force`

After finishing work, summarize what changed and let the user commit.

Allowed without confirmation: `git status`, `git diff`, `git log`,
`git branch` (read-only), `git fetch origin`.

## Reference projects

- **Scene Flow Pro** (`/Users/julianpetersen/Documents/GitHub/scene-flow-pro/CLAUDE.md`)
  — primary security pattern source. We mirror its `check_user_permission`
  pattern, `(select auth.uid())` rule, no-role-name-checks rule, hierarchy
  guard, and audit-trail FK pattern.

- **TubeProxies App** (`/Users/julianpetersen/Documents/GitHub/Tubeproxies App/`)
  — the existing dashboard. Shares brand tokens (cream `#F2F1EA` / red
  `#E60000` / dark `#0F0F0F`, Plus Jakarta Sans / JetBrains Mono — see
  `dashboard/src/app/globals.css`). One Stripe account across both
  TubeProxies products (no separate billing).

## Active development phase

We are in **Phase 2** of [PLAN.md](PLAN.md) — auth + RBAC + plan features
+ Settings/Members/Groups/Roles/Proxies pages all functional.

**Phase 3 next:** TubeProxies API integration. The placeholder "Sync
TubeProxies" button on the Proxies page calls a stub; wire it to the
real API client (`src/lib/tubeproxies-api.ts` per [PLAN.md §9](PLAN.md)).

**Phase 4 after:** Engine integration — fingerprint-chromium binary
launch, gost subprocess, the two safeguards (concurrent-open lock,
proxy precheck) that already exist in the schema but aren't wired.

## Per-profile dock icons (macOS)

Each open profile gets its own dock entry showing its **real** profile
number on the TubeProxies brand tile (AdsPower-style), e.g. profile 247
shows "247" — NOT a wrapped `n % 100` slot.

**Primary path — render the real number at launch** (`icon-badge.ts`
→ `generateDynamicIcns`):
- `sips` converts the shipped `slot-0.icns` brand tile to a PNG base.
- `src/main/engine/badge-canvas.ts` composites the number into a red
  `#E60000` pill (bottom-right, matching the slot geometry) on a hidden
  offscreen `<canvas>` — no native image dep. Shared with the Windows
  taskbar icon (`win-icon-generator.ts`, `placement: 'center'`).
- `src/main/engine/mac-icns.ts` downscales that PNG to every iconset
  size with `sips` (NOT `nativeImage` — its Retina-scaled PNGs make
  `iconutil` reject the set) and runs `iconutil -c icns`.
- Result is cached at `<userData>/mac-icons/profile-<n>.icns` (rendered
  once per number) and copied into the per-profile cloned
  `Browser.app/Contents/Resources/`; `CFBundleIconFile` points at it.

**Fallback — pre-rendered slot icons** (`scripts/build-dock-icons.py`,
Pillow + iconutil; `npm run build:dock-icons`): used for the un-numbered
base tile (`slot-0`) and only if dynamic rendering fails. Output
`resources/dock-icons/slot-{0..99}.icns` (committed, ~20 MB), shipped via
`electron-builder.yml` `extraResources` to
`process.resourcesPath/dock-icons/`. In this fallback numbers ≥ 100 wrap
(`n % 100`) and the dock name disambiguates. Re-run the Python script
only when `public/logo.png` or the pill constants change.

- **macOS icon cache**: stale dock icons after a launch usually mean
  Finder cached the previous version. `killall Dock` forces redraw. The
  per-number cache also means editing pill style requires deleting
  `<userData>/mac-icons/` to force a re-render.
