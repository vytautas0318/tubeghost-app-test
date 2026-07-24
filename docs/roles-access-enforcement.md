# Roles & access — permission enforcement map

The Roles & access page (`pages/Roles.tsx`) edits a **catalogue** of UI rows
(`pages/roles-access/permSchema.ts`). Each row is a `level` (none/read/write/
full) or a `toggle`. The catalogue does **not** store its own values — every
row maps to one or more real Supabase permission keys via
`pages/roles-access/permMap.ts`, and those keys live in `role_permissions`.

**Server-side enforcement is RLS.** Every write to a workspace resource runs
through a policy calling `check_user_permission(auth.uid(), <key>, workspace_id)`
(migration `0002_full_schema.sql`, `0005_proxies.sql`, `0017_roles_access_catalog.sql`).
The renderer gates are UX only (`useHasPermission` / `can()` /
`canLevel()` in `lib/permissions.ts`) and can be bypassed by a tampering
client — RLS still rejects the operation. Never trust a client-sent role or
permission; the acting user's role is always resolved server-side.

## Level ladder semantics

`none < read < write < full`. A level row grants a **cumulative** set of keys:
`read` grants the read tier; `write` grants read+write; `full` grants
read+write+full. The level shown is derived from which tiers are fully held
(`levelFromKeys`). Required-level checks use `canLevel(perms, ladder, 'write')`
(`>=` on the ladder).

## Catalogue → DB key → enforcement

Legend for **Enforced**: ✅ = RLS policy live today · 🕓 = key exists +
grants applied, feature/table not built yet (policy lands with the feature).

### PROFILES
| Catalogue row | Ctrl | DB keys | Enforced |
|---|---|---|---|
| Browser profiles | level | `profiles.view`,`profiles.launch` / `profiles.create`,`profiles.edit` / `profiles.delete`,`profiles.force_unlock` | ✅ `profiles.*` policies (0002); renderer: ProfilesList/ProfileEditor/RowMenu/LockBanner |
| Profile assignment | level | `profiles.view` / `profiles.assign_member` | ✅ policy `profiles.assign_member` (0017) |
| Fingerprint editing | level | `profiles.view` / `profiles.edit_fingerprint` | ✅ policy `profiles.edit_fingerprint` (0017) + fingerprint edit path |
| Delete profiles | toggle | `profiles.delete` | ✅ policy `profiles.delete` (0002) |
| Bulk actions | toggle | `bulk.create_profiles`,`bulk.edit_profiles`,`bulk.delete_profiles` | ✅ bulk keys gate BulkCreate/BulkActionBar + RLS on the underlying profile writes |

### ACCOUNTS & COOKIES
| Catalogue row | Ctrl | DB keys | Enforced |
|---|---|---|---|
| Account logins | level | `accounts.view` / `accounts.autofill` / `accounts.manage` | 🕓 accounts feature not built |
| Import cookies | toggle | `cookies.import` | 🕓 |
| Export cookies & sessions | toggle | `cookies.export` | 🕓 |

### AUTHENTICATOR (2FA)
| Catalogue row | Ctrl | DB keys | Enforced |
|---|---|---|---|
| Generate 2FA codes | level | `twofa.view` / `twofa.generate` | 🕓 authenticator feature not built |
| Add & remove tokens | toggle | `twofa.manage_tokens` | 🕓 |
| Reveal setup keys | toggle | `twofa.reveal_seed` | 🕓 |
| Export tokens | toggle | `twofa.export` | 🕓 |

### PROXIES
| Catalogue row | Ctrl | DB keys | Enforced |
|---|---|---|---|
| Proxy pool | level | `proxies.view` / `proxies.assign` | ✅ `proxies.view`/`proxies.assign` policies (0005); renderer: Proxies.tsx |
| Add & remove proxies | level | `proxies.view` / `proxies.create` / `proxies.delete` | ✅ `proxies.create`/`proxies.delete` policies (0005) |
| View proxy credentials | toggle | `proxies.view_credentials` | ✅ key gates credential reveal in ProxyDetailDrawer; TubeProxies creds also trigger-protected |
| Test proxies | toggle | `proxies.test` | ✅ renderer gate (ProxyRowMenu) + proxy-test edge function checks the key |

### AUTOMATION
| Catalogue row | Ctrl | DB keys | Enforced |
|---|---|---|---|
| Automations | level | `automations.view` / `automations.edit` / `automations.run` | 🕓 automations feature not built |
| Synchronizer | toggle | `synchronizer.run` | 🕓 |
| API & AI MCP | toggle | `api.manage` | 🕓 |
| Extensions | level | `profiles.view` / `extensions.create`,`extensions.edit` / `extensions.delete` | ✅ `extensions.*` policies (0002, plan-gated) |

### TEAM & WORKSPACE
| Catalogue row | Ctrl | DB keys | Enforced |
|---|---|---|---|
| Manage members | toggle | `members.invite`,`members.remove`,`members.assign_role` | ✅ member + user_roles policies (0002/0003); renderer: Members.tsx |
| Manage roles & permissions | toggle | `roles.create`,`roles.edit`,`roles.delete` | ✅ `app_roles`/`role_permissions` policies (0002); this page's edits also gated on `roles.edit` |
| Billing & subscription | toggle | `billing.view`,`billing.manage` | ✅ `billing.manage` gates settings/BillingTab; plan columns trigger-protected |
| Activity & audit log | toggle | `activity.view` | ✅ activity_log select policy (0002) |
| Export workspace data | toggle | `workspace.export_data` | 🕓 bulk-export path not built |
| Workspace settings | toggle | `workspace.edit_settings` | ✅ workspace update policy (0002); renderer: settings/*Tab |

## Adding a new backed feature later

When the accounts / authenticator / automations features ship, add their RLS
policies referencing the keys above — no catalogue or role-grant change is
needed, because the grants were seeded in migration 0017. That is the point of
"permissions are the API": the role configuration is already correct.
