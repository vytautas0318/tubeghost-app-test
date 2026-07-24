# Phase 1 (revised) — Target Architecture: React website, browser-launch features dropped

Status: **proposal, awaiting approval.** No code written yet. This supersedes the
earlier local-agent plan — the user decided (a) they want a pure React + Node
**website**, no Electron/desktop, and (b) to **DROP** the browser-launching core
rather than migrate it (explicitly overriding the "preserve 100%" rule).

## 0. What we're building

A **React SPA** (the existing `src/renderer`, rebuilt with plain Vite) talking to
**Supabase** (Postgres + RLS + realtime + Deno edge functions) — all of which
already run against a browser client today. Everything desktop-bound is removed.

### Key finding: you likely need NO custom Node backend

Every server-side secret / privileged op for the KEPT features is ALREADY a
deployed Supabase **edge function**:

| Need | Already handled by |
|---|---|
| Proxy connectivity + egress IP test | `supabase/functions/proxy-test` (undici + socks-proxy-agent, full impl) |
| IP → geo/timezone | `functions/ip2location-lookup` |
| TOTP encrypt/generate/reveal (secret key) | `functions/totp` |
| Kill GoTrue sessions / "sign out everywhere" | `functions/sessions` |
| AI assistant (provider keys) | `functions/assistant` |
| Notifications fan-out (webhook/email) | `functions/notify-dispatch`, `notify-test`, `outbox-retry` |
| Invitation emails | `functions/send-invitation-email` |
| Identity→data token bridge | `functions/auth-exchange` |

The Electron app used `window.api.proxies.test` (main-process) instead of the
edge function only to avoid burning ip2location quota — the edge function is a
drop-in replacement. So the SPA calls `supabase.functions.invoke('proxy-test', …)`
and **the whole app is client + Supabase, no separate server to build/host.**

→ This is a decision point (§7). Default recommendation: **SPA-only on Supabase.**

## 1. Features: KEEP vs DROP

**KEEP (all already Supabase-backed, browser-native):**
Auth (email/password, magic-link, Google OAuth — via web redirect), profiles CRUD
+ full fingerprint/proxy/identity **editor** (data only, no launch), proxies
management + proxy-test (edge fn), groups, tags, team/members/roles/RBAC,
invitations, billing, workspace settings (General/Fingerprint/Network-defaults/
Notifications/Security), authenticator/TOTP, phone-numbers page, extensions
**metadata + assignment**, automations **config** (create/edit/list), notifications,
command palette, assistant (chat; plan-execution for dropped actions removed),
bulk create.

**DROP (desktop/browser-launch only):**
Profile launch/close/running-state, engine (fingerprint-chromium) install/status,
synchronizer, session-sync (pack/unpack + cross-device), per-profile proxy bridge
(gost/sing-box), CDP/sessions, per-profile dock/taskbar icons, cloudflared tunnel,
the local REST API + MCP server, extensions **file import / launch-path**,
automation **step execution**, deep links, OS window controls.

## 2. Exact UI changes (from the impact audit)

### DELETE (page/component exists only for a dropped feature)
- Pages: `pages/Synchronizer.tsx` + `pages/synchronizer/*`; `pages/Api.tsx` +
  `pages/api/*` (incl. `ApiDocs.tsx`).
- Settings: `settings/EngineTab.tsx`, `settings/AdvancedTab.tsx`,
  `settings/SyncPanel.tsx` (all orphaned or session-sync/engine only).
- Profile-editor launch parts: `profile-editor/{LaunchButton,LockBanner,
  StatusCard,SessionUrlsCard}.tsx`.
- Profiles-list launch parts: `profiles-list/{SessionSyncBadge,useSessionSyncMap}.tsx`.
- Components: `EngineDownloadIndicator.tsx`, `LaunchPhasePill.tsx`, `EgressBadge.tsx`.
- Stores: `store/launchStore.ts`, `store/engineStore.ts`.
- Orphans already dead: `pages/Stub.tsx`, `MembersLegacy.tsx`, `RolesLegacy.tsx`.
- Dangling logic layer (delete after UI): `lib/profile-launch.ts`, `lib/engine.ts`,
  `lib/session-sync*.ts`, `lib/api-bridge.ts`, `lib/extensions-launch.ts`,
  `lib/automations/engine.ts` (+ `scheduler.ts`), `lib/sessions.ts` (device id),
  `lib/proxy-test.ts` (replaced by edge-fn call).

### TRIM (page kept; remove launch/desktop pieces)
- `App.tsx` — remove `useDeepLinkNavigation`, `window.api.window.platform()`
  effect, `initLaunchStoreSubscriptions`/`initEngineStoreSubscriptions`/
  `recoverLaunchState`/`useEngineQueueDrainer`/`useLaunchHeartbeats`/
  `useAutomationScheduler`/`registerApiBridge`; drop `/synchronizer`,`/api`,
  `/api/docs` routes; switch `HashRouter`→`BrowserRouter` (in `main.tsx`).
- `ProfilesList` / `ProfileRow` — remove `LaunchButton` cell, `SessionSyncBadge`,
  `IN USE`/openByOther badge, `useSessionSyncMap`.
- `ProfileEditor` — remove `LaunchButton`/`LockBanner`, the "Browser session"
  section, the `onExited`/`onPhase` reload effect, `canLaunch`.
- `Extensions` — remove `.crx`/zip file-import (`window.api.extensions.*`); keep
  metadata catalog + assignment. (Web-store-by-URL add only if reimplemented via
  an edge fn; otherwise drop the add-affordance.)
- `Automations` — remove Run/Cancel + running-state; keep create/edit/delete/
  duplicate/import config.
- `Settings` — remove Network tab's launch-routing semantics (or keep only the
  fields the web app still honors), drop Sync tab.
- `SignIn`/`SignUp` — Google OAuth desktop popup → web redirect flow.
- `Titlebar` — drop window min/max/close + engine indicator; becomes a plain
  brand/theme header (or remove entirely).
- `Sidebar` — remove "Synchronizer" and "API & AI MCP" nav items.
- `Assistant` — remove `useLaunchStore` running read; drop launch/sync/api plan
  actions.
- `CommandPalette` — prune commands targeting deleted routes.

## 3. Auth changes (small, already browser-safe)
- Google OAuth: drop `window.api.auth.openOAuthWindow`; use standard
  `signInWithOAuth` **with** browser redirect + a `/auth/callback` route that
  calls `exchangeCodeForSession`. Magic-link uses a normal `emailRedirectTo`.
- Dual-client + token-exchange (`lib/supabase.ts`, `token-exchange.ts`) unchanged
  — already `fetch`-based.
- `.env`: keep `VITE_SUPABASE_*` + `VITE_TUBEPROXIES_SUPABASE_*`. No new vars if
  SPA-only.

## 4. Folder layout (SPA-only recommendation)

Flatten to a single app — no monorepo needed if there's no server:

```
tubeghost/
├─ index.html                 # moved up from src/renderer/
├─ vite.config.ts             # plain Vite + @vitejs/plugin-react + @tailwindcss/vite
├─ tsconfig.json              # single web tsconfig (DOM libs)
├─ package.json               # web deps only
├─ public/
├─ src/
│  ├─ main.tsx  App.tsx  env.d.ts
│  ├─ pages/ lib/ store/ components/ styles/ assets/
│  └─ shared/                 # ← today's src/shared, framework-free bits kept by web
└─ supabase/                  # unchanged (functions + migrations)
```
(If the "keep a Node backend" option is chosen instead, use the workspaces
monorepo `apps/{web,server}` + `packages/shared` from the prior draft.)

## 5. Dependencies

**Remove:** `electron`, `electron-vite`, `electron-builder`,
`@electron-toolkit/*`, `better-sqlite3` (unused), `koffi`, `express`,
`express-rate-limit`, `ws`, `@types/ws`, `tar`, `extract-zip`,
`https-proxy-agent`, `socks-proxy-agent`, `@modelcontextprotocol/sdk`,
`@types/better-sqlite3`, `@types/express`, `@types/supertest`, `supertest`,
`playwright` (unless kept for e2e). Remove scripts: `download-sing-box/gost/
cloudflared`, `rename-electron-dev`, `build:dock-icons`, all `build:{win,mac,linux,
unpack}`, the electron `postinstall` chain.

**Keep:** react, react-dom, react-router-dom, zustand, react-hook-form,
`@hookform/resolvers`, zod, `@supabase/supabase-js`, `otpauth`, lucide-react,
`class-variance-authority`, clsx, `tailwind-merge`, date-fns, tailwindcss,
`@tailwindcss/vite`, vite, `@vitejs/plugin-react`, typescript, vitest, eslint,
prettier.

## 6. Build / tooling (Phase 3 preview)
- Replace `electron.vite.config.ts` with `vite.config.ts` (root), aliases
  `@`/`@renderer` → `src`, tailwind plugin.
- Move `src/renderer/index.html` → root `index.html`, script src → `/src/main.tsx`.
- `main.tsx`: `HashRouter` → `BrowserRouter`. Add SPA-fallback for the host
  (Vercel/Netlify rewrite all → `/index.html`) so deep links work.
- Single `tsconfig.json`; drop `tsconfig.node.json`. `npm run dev` = `vite`;
  `npm run build` = `tsc -b && vite build`.
- Retarget vitest: keep the pure-logic tests under `src/shared/*` and
  `lib/__tests__`; delete the Electron/api-server/mcp tests (their features are
  dropped).

## 7. Decision for you: Node backend or not?

- **A (recommended): SPA-only on Supabase.** No server to build/host. proxy-test
  and everything else run via existing edge functions. Simplest, cheapest, and
  matches "convert to a website" with the least new surface.
- **B: React SPA + thin Node/Express backend.** Only worth it if you want to move
  proxy-test OFF Supabase quota, add server logic that doesn't fit an edge
  function, or avoid exposing edge functions directly. Adds the workspaces
  monorepo + a deploy target.

## 8. Decisions — CONFIRMED
1. **Node backend?** ✅ **A — SPA-only on Supabase.** No custom server. SPA calls
   existing edge functions (`proxy-test`, `totp`, etc.) via
   `supabase.functions.invoke()`. Single flattened React project (§4 layout).
2. **Extensions add-flow?** ✅ **Drop the "add" action.** Keep the catalog +
   assign-to-profile; remove upload `.crx` / add-from-Web-Store. No server-side
   crx parsing.
3. **Automations?** ✅ **Config-only.** Keep create/edit/list/duplicate/import;
   remove Run + run-history.
4. **Dropped DB/edge cleanup** — leave unused edge functions + columns in place
   (safe, out of scope for this migration).

### Consequence: `lib/proxy-test.ts` rewrite (not delete)
proxy-test stays a feature but its transport changes: replace the
`window.api.proxies.test` call with `supabase.functions.invoke('proxy-test', …)`
(same request/response shape). `useProxyCustom.ts` + `lib/proxy-test.ts` are
TRIMmed to call the edge fn, not deleted.
```
