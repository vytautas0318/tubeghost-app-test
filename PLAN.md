# TubeProxies Browser — Build Plan

This document is the source of truth for building **TubeProxies Browser**, a white-label anti-detect browser for faceless YouTube operators. Claude Code should treat this file as the project spec and reference it for every task.

---

## 1. Project Overview

TubeProxies Browser is an Electron desktop app that wraps **fingerprint-chromium** (a BSD-3 licensed Chromium fork with engine-level fingerprint spoofing) and adds:

- Profile management (create, edit, launch, group, tag)
- Team collaboration (workspaces, roles, member invites)
- One-click TubeProxies proxy binding
- Auto-generated fingerprints with coherence enforcement
- Chrome extension auto-install per profile
- YouTube-specific tooling (Tools section)
- Bulk operations

Conceptually similar to **AdsPower**, but built for TubeProxies customers with deep proxy integration and YouTube-specific features none of the generic anti-detect browsers offer.

**Engine validated:** fingerprint-chromium hits 100% on browserscan.net with proper config — production-grade.

**License model:** TubeProxies Browser is a closed-source product. Bundled fingerprint-chromium is BSD-3 (we credit them in About → Licenses; we keep our wrapper code closed forever).

---

## 2. Reference Codebases

### 2.1 TubeProxies dashboard (UI reference — study before writing UI)

**Path:** `/Users/julianpetersen/Documents/GitHub/Tubeproxies App/dashboard`

**Brand tokens (locked — copy verbatim from `dashboard/src/app/globals.css`):**

```css
@theme inline {
  --color-brand-red: #E60000;       /* primary actions, selection, accent */
  --color-brand-dark: #0F0F0F;      /* foreground / text */
  --color-brand-cream: #F2F1EA;     /* background */
  --color-brand-surface: #E6E5DE;   /* cards, panels, raised surfaces */

  --color-background: var(--color-brand-cream);
  --color-foreground: var(--color-brand-dark);

  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

Also copy: custom scrollbar (6px, `#cbd5e1` thumb), `::selection` (red bg, white fg), `.glass-panel` utility, `fadeIn` keyframes. Bundle the Plus Jakarta Sans + JetBrains Mono webfonts locally so the desktop app works offline.

**Other things to study (not locked, just mirror):**

- Component library (buttons, inputs, cards, tables, modals) — shadcn/ui + Radix
- Icon set — lucide-react
- Layout primitives (sidebar, page header, content padding)
- Logo + brand assets — copy from `dashboard/public/`
- Loading/empty/error state patterns
- Toast/notification system

**Rule:** TubeProxies Browser must look like a sibling product to the TubeProxies dashboard. Copy components, design tokens, and layout patterns directly. Don't invent new visual language.

Before starting any UI work, Claude Code should:

1. Read `package.json` of the dashboard to confirm current versions (shadcn, Radix, lucide-react, Tailwind v4)
2. Confirm tokens above against the live `dashboard/src/app/globals.css` in case they've drifted
3. Read 2-3 page components to understand structure conventions
4. Mirror the same stack in TubeProxies Browser

### 2.2 Engine reference

**Project:** [fingerprint-chromium](https://github.com/adryfish/fingerprint-chromium)

**License:** BSD-3-Clause (commercial-friendly, no copyleft)

**Binary version (current):** Chromium 142.0.7444.x (track upstream; pin a known-good version per release of TubeProxies Browser)

**Validated launch flags:**

```
--fingerprint=<seed>                            # int — controls Canvas/WebGL/Audio noise
--fingerprint-platform=<windows|macos|linux>
--fingerprint-platform-version=<version>
--fingerprint-brand=<Chrome|Edge>
--fingerprint-brand-version=<version>
--fingerprint-hardware-concurrency=<n>
--fingerprint-webgl-vendor=<str>
--fingerprint-webgl-renderer=<str>
--lang=<locale>
--accept-lang=<locale,locale>
--timezone=<tz>
--window-size=<w>,<h>
--proxy-server=<scheme>://<host>:<port>
--user-data-dir=<path>                          # required — isolates the profile
--no-first-run --no-default-browser-check
```

**Known limitations:**

- `--proxy-server` does NOT accept inline credentials. Auth via popup (interactive testing only) or local auth-forwarding proxy (gost) per profile (production).
- WebGL renderer string spoofing requires explicit `--fingerprint-webgl-vendor` and `--fingerprint-webgl-renderer` to avoid throwing exceptions.
- Mac builds are released inconsistently. Bundle the latest available Mac binary; track upstream releases.

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | Electron + Vite + React + TypeScript | Fast to ship, familiar, cross-platform |
| State | Zustand | Simpler than Redux, sufficient for this scope |
| UI components | shadcn/ui + Tailwind v4 (CSS-first, no `tailwind.config.ts`) | Matches TubeProxies dashboard exactly (`@theme inline` in `globals.css`) |
| Forms | react-hook-form + zod | Validation + type safety |
| Backend | Supabase | Auth + Postgres + realtime + storage in one |
| Local cache | better-sqlite3 | Offline support, fast reads |
| Engine | fingerprint-chromium binaries (bundled per platform) | BSD-3, production-grade spoofing |
| Proxy auth | gost (local forwarder) | Bypasses Chromium's no-inline-credentials limitation |
| Billing | Stripe | Standard, integrates with Supabase |
| Updates | electron-updater + Cloudflare R2 | Cheap, simple |
| Crash reporting | Sentry | Free tier covers initial scale |

---

## 4. Architecture

```
/Users/julianpetersen/documents/github/tubeproxies-browser/
├── electron/
│   ├── main.ts                  # main process entry
│   ├── preload.ts               # contextBridge exposing IPC
│   ├── ipc/                     # IPC handlers
│   │   ├── profiles.ts          # launch, close, list-running
│   │   ├── proxy-auth.ts        # spawn/manage gost forwarders
│   │   └── extensions.ts        # extension install/uninstall
│   ├── engine/                  # fingerprint-chromium launch logic
│   │   ├── launcher.ts          # spawn binary with flags
│   │   ├── flag-builder.ts      # profile -> CLI args mapper
│   │   └── runtime-tracker.ts   # which profiles are running
│   └── db/
│       └── local-cache.ts       # better-sqlite3 read cache
├── src/                         # renderer (React)
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── Profiles.tsx
│   │   ├── ProfileEditor.tsx
│   │   ├── BulkCreate.tsx
│   │   ├── Groups.tsx
│   │   ├── Members.tsx
│   │   ├── Settings.tsx
│   │   ├── Extensions.tsx
│   │   └── YouTubeTools.tsx
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── StatusBar.tsx
│   │   ├── ProfileTable.tsx
│   │   ├── FingerprintForm.tsx
│   │   ├── ProxyPicker.tsx
│   │   ├── TagInput.tsx
│   │   └── ui/                  # shadcn components
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── tubeproxies-api.ts
│   │   ├── fingerprint-generator.ts
│   │   └── auth-store.ts
│   ├── stores/
│   │   ├── profiles.ts
│   │   ├── workspace.ts
│   │   └── ui.ts
│   ├── types/
│   │   └── database.ts          # generated from Supabase
│   └── App.tsx
├── engine/                      # bundled fingerprint-chromium per platform
│   ├── win32/
│   ├── darwin-arm64/
│   ├── darwin-x64/
│   └── linux/
├── public/
├── PLAN.md                      # this file
├── CLAUDE.md                    # short context file for Claude Code
├── package.json
├── tailwind.config.ts
├── electron-builder.yml
└── .env
```

---

## 5. UI Layout

### 5.1 Window structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ [TubeProxies Browser logo]                          [- □ ×]         │
├─────────┬───────────────────────────────────────────────────────────┤
│         │                                                           │
│ MAIN    │                                                           │
│ NAV     │                                                           │
│         │                                                           │
│ Profiles│                  PAGE CONTENT AREA                        │
│ Groups  │                                                           │
│ Members │                                                           │
│ Exten-  │                                                           │
│  sions  │                                                           │
│ Settings│                                                           │
│         │                                                           │
│ ─────   │                                                           │
│         │                                                           │
│ YOUTUBE │                                                           │
│ TOOLS   │                                                           │
│         │                                                           │
│ Tool 1  │                                                           │
│ Tool 2  │                                                           │
│ ...     │                                                           │
│         │                                                           │
├─────────┴───────────────────────────────────────────────────────────┤
│ 247 profiles · 5 members · Julian (Owner)              v0.1.0       │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Sidebar

Two visually separated sections in a single sidebar (with a divider between them):

**Section 1 — Browser**

- **Profiles** (default landing page)
- **Groups**
- **Members**
- **Extensions** (Chrome extensions to auto-install on profiles)
- **Settings**

**Section 2 — YouTube Tools** (header label: "YOUTUBE TOOLS")

- Placeholder items for now; this is where TubeProxies-specific YT automation will live in v2. Initial items:
  - Channel Manager (placeholder)
  - View Booster (placeholder)
  - Comment Tools (placeholder)
  - Analytics (placeholder)

Use shadcn `Sidebar` or build a custom one matching the TubeProxies dashboard's sidebar pattern. Active route highlighted with the dashboard's accent color.

### 5.3 Status bar (bottom)

Persistent footer showing live counts and identity:

```
{profileCount} profiles · {memberCount} members · {currentUser.name} ({currentUser.role})    v{version}
```

- Profile count: count of profiles in current workspace (live, updates on change)
- Member count: count of accepted workspace members
- Current user + role from workspace_members.role
- App version (from package.json)
- Optional: connection status indicator (online/offline) on the right

### 5.4 Page-level patterns

Every page follows the same structure:

```
┌─────────────────────────────────────────────────────────────────┐
│ Page Title                                  [primary action btn]│
│ Optional subtitle / description                                 │
├─────────────────────────────────────────────────────────────────┤
│ [filters / search / tabs]                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Page content (table, form, grid, etc.)                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Match the TubeProxies dashboard's exact spacing, font sizes, and header styling.

---

## 6. Features

### 6.1 Authentication & Workspace

- **Sign up:** email + password, plus a "Workspace name" field stored in `auth.users.raw_user_meta_data.workspace_name`. Trigger `handle_new_user()` creates the workspace and adds the user as `owner`.
- **Sign in:** email + password. Optional: Google OAuth via Supabase Auth.
- **Forgot password:** Supabase magic-link flow.
- **Workspace switcher** in top-left of sidebar (dropdown). Users can belong to multiple workspaces.
- **Invite flow:** Members page → "Invite member" → email + role selector → Supabase Auth invite.
- **Onboarding:** new users land on Profiles page with empty state + CTA to create first profile.

### 6.2 Profiles (the core feature)

#### 6.2.1 Profile list page (`/profiles`)

- Data table with columns: checkbox, **Name**, **Group**, **Tags**, **Proxy** (icon + IP/geo), **Last opened**, **Assigned to**, **Status** (running/stopped indicator), **Actions** (Launch / Edit / Clone / Delete).
- Top bar: search input, group filter dropdown, tag filter chips, "+ New Profile" button, "Bulk Create" button, "Import" button.
- Bulk select → bulk actions menu (delete, move to group, add tag, assign to member, launch all).
- Pagination or virtualized scroll (100+ profiles must perform).
- Click row → opens **Profile Editor** in a side sheet (not a separate page) so users can edit without losing list context.

#### 6.2.2 Profile creation flow

Modal or side sheet with these sections (collapsible accordions):

**1. Basics**

- Name (required)
- Group (dropdown, multi-select not allowed; "Ungrouped" by default)
- Tags (chip input with autocomplete from existing tags)
- Notes (textarea, optional)
- Assigned to (dropdown of workspace members)

**2. Browser**

- Browser engine: dropdown with one option for now — **Chromium** (locked, with note "More engines coming")
- Chrome version: dropdown — `142`, `141`, `140`, `139`, `138`, `137` (most recent 6 versions; defaults to most recent)
- Brand: dropdown — `Chrome`, `Edge` (defaults to Chrome)

**3. Fingerprint**

- Big primary button: **"Generate New Fingerprint"** — randomizes seed + all spoofed fields with coherence
- Below, expandable section "Advanced — manual override":
  - Fingerprint seed (number)
  - Platform (Windows/Mac/Linux)
  - Platform version
  - Hardware concurrency (CPU cores)
  - Device memory (GB)
  - WebGL vendor (text)
  - WebGL renderer (text)
  - Language (locale picker)
  - Timezone (timezone picker)
  - Window size (width × height)
  - User agent (text, auto-derived from above; editable)
- "Test Fingerprint" button (optional v2): launches the profile pointed at browserscan.net to validate.

**4. Proxy**

- Source: radio — **TubeProxies inventory** (default) | **Manual**
- If TubeProxies: dropdown of available IPs with search. Each row shows: country flag, ISP, IP:port, last-used date.
- If Manual: type (HTTP/SOCKS5), host, port, username, password.
- On selection: auto-fill timezone, language, geolocation to match the proxy's geo. Show a "Coherence: ✓ Good" or warning indicator.
- C-Class warning: if the chosen IP shares a /24 subnet with another profile in the workspace, show a yellow warning with the linked profile names.

**5. Extensions** (collapsible, defaults to "Same as workspace default")

- Multi-select of available extensions (workspace-scoped).
- Override workspace defaults for this profile.

**Save** button → writes to Supabase, profile appears in the list immediately via realtime.

#### 6.2.3 Profile launch

- Click "Launch" button → IPC to main process → **safeguards run first** (see 6.2.3.1), then main builds CLI args from profile config → spawns fingerprint-chromium binary with isolated `user-data-dir`.
- If proxy has auth: main spawns a per-profile gost instance on a free localhost port forwarding to the real proxy with credentials, then passes `--proxy-server=http://127.0.0.1:<localPort>` to Chromium.
- Profile shows "Running" status pill. "Close" button stops both Chromium and gost.
- `last_opened_at` and `last_opened_by` updated on launch.
- Activity log entry: `{action: 'launched', profile_id, user_id}`.

##### 6.2.3.1 Launch safeguards

Two pre-flight checks gate every launch. Both are **toggleable in Settings → Advanced**, **defaults are ON**, and the toggles are workspace-scoped (admins set them, members can't override).

**Safeguard A — Concurrent-open lock (single-session enforcement)**

The same profile must never be opened by two users at the same time, on two machines at the same time, or twice on one machine. Cookie-jar corruption and login-detection from YouTube are real risks.

- New columns on `profiles`: `open_session_id uuid`, `open_by_user_id uuid references auth.users`, `open_by_device text`, `open_at timestamptz`, `open_heartbeat_at timestamptz`.
- On launch attempt, the renderer calls a `try_acquire_profile_lock(profile_id, device_id)` SECURITY DEFINER RPC. The function:
  - If `open_session_id IS NULL` or `open_heartbeat_at < now() - interval '60 seconds'` (stale lock from a crashed session) → atomically claims the lock and returns `{acquired: true}`.
  - Otherwise returns `{acquired: false, held_by_user, held_by_device, held_since}`.
- If `acquired: false`, the UI shows a modal: **"Already open by Maria (MacBook-Pro) since 14:32. Force close her session?"** Only Owner/Admin sees the "Force close" button (sets the lock to NULL, marks the activity log entry `{action: 'force_unlocked', forced_by}`, the other user gets a realtime push and their Chromium instance is killed by main process).
- Heartbeat: while a profile is open, main pings `update_profile_heartbeat(session_id)` every 30 s. On clean close, lock is released. On crash, the 60-s timeout above releases it.
- Profile list shows a small avatar + machine icon overlay on rows that are currently open by someone — so users see "in use" before they even try to click launch.
- **Setting toggle:** Settings → Advanced → "Prevent concurrent profile sessions" (default ON). When OFF, the lock is still acquired but never blocks; only used to display the "in use" indicator.

**Safeguard B — Proxy precheck (don't launch on a dead proxy)**

Launching Chromium with a broken proxy means YouTube sees the *real* IP for ~5 seconds before the request fails — exactly what we're protecting against.

- Before spawning Chromium, main does a `HEAD https://api.ipify.org` (or `https://ifconfig.me/ip`) through the proxy with a **3-second timeout**.
- Verify: response received, returned IP matches the expected proxy egress (we already know it from TubeProxies inventory or store it on first successful launch in `profiles.last_known_egress_ip`).
- If the precheck fails → modal: **"Proxy 198.51.100.42:8080 didn't respond. Launching now would expose your real IP. [Retry] [Launch anyway] [Change proxy]"**. "Launch anyway" requires Admin role.
- If egress IP mismatches the expected one → modal: **"Proxy returned a different IP than expected (got X, expected Y). Possible proxy hijack or misconfiguration."** Same three buttons.
- **Setting toggle:** Settings → Advanced → "Verify proxy before launch" (default ON). Two sub-options:
  - "Block launch on proxy failure" (default ON) — if OFF, shows a warning toast but still launches.
  - "Block launch on egress IP mismatch" (default ON).
- For profiles with no proxy configured (testing only), the precheck is skipped entirely.

**Both safeguards must be honored by every launch path:** single click in profiles list, "Save & launch" in editor, bulk launch, and IPC from future YouTube tools. Implement once in `src/main/profile-launcher.ts` so it can't be bypassed.

#### 6.2.4 Bulk profile creation (`/profiles/bulk`)

Form:

- **Number of profiles** (1–500)
- **Naming pattern** (e.g., `MrState30 - {n}` → `MrState30 - 1`, `MrState30 - 2`, ...)
- **Group**
- **Tags**
- **Browser version** (single value applied to all)
- **Fingerprint strategy:** radio — **Random per profile** (recommended) | **Same for all**
- **Proxy strategy:** radio
  - **One TubeProxies IP per profile** (auto-pick from inventory, ensuring no /24 collisions)
  - **Pool of N IPs round-robin**
  - **Same proxy for all** (warning: bad practice)
  - **Manual list** (paste lines: `host:port:user:pass`)
- **Coherence:** auto-set timezone/language per proxy geo (default ON)
- **Preview** button shows the first 3 profiles that would be created.
- **Create** button → server-side function batch-inserts all profiles in a single transaction. Progress bar.

### 6.3 Groups (`/groups`)

- List of groups in the workspace with name, color, profile count, and actions.
- Create group: name + color picker (8 preset colors).
- Drag profiles into groups from the Profiles page (HTML5 drag-and-drop).
- Delete group: prompts to move profiles to "Ungrouped" or another group.
- Groups appear as a filter on the Profiles page and as a folder structure in the sidebar (optional — keep flat for v1).

### 6.4 Tags

- Free-form labels, no predefined list.
- Stored as `text[]` on `profiles`.
- Tag input: chip-style with autocomplete from existing tags in the workspace (query `select distinct unnest(tags) from profiles where workspace_id = ?`).
- Filter Profiles page by tag chips at top.
- Bulk action: add/remove tag from N selected profiles.

### 6.5 Members & Roles (`/members`)

- List of workspace members: avatar, name, email, role, joined date, last active, actions.
- Invite button → email + role dropdown (admin/manager/viewer; owner is locked to the original creator).
- Pending invites section.
- Role definitions:
  - **Owner** — full access, billing, can delete workspace, only one per workspace.
  - **Admin** — manage members, full profile/group/extension access, manage settings.
  - **Manager** — full profile/group access, can launch any profile, cannot manage members or settings.
  - **Viewer** — read-only profile access, can launch profiles assigned to them, cannot edit.
- UI controls hidden/disabled per role (enforced both client-side AND in RLS policies).

### 6.6 Settings (`/settings`)

Tabs inside the Settings page:

#### General

- Workspace name
- Workspace logo
- Default browser version (used as default in profile creation)
- Default Chrome flags (advanced; comma-separated)

#### Account

- Profile photo, display name, email
- Change password
- Two-factor auth (Supabase MFA)

#### TubeProxies

- TubeProxies API key (encrypted at rest via Supabase vault)
- "Test connection" button
- IP inventory refresh interval (default: every 5 min)

#### Billing

- Current plan
- Usage (X / Y profiles, Z / W members)
- "Manage subscription" → Stripe customer portal
- Invoices

#### Workspace defaults

- Default extensions to auto-install on new profiles
- Default fingerprint coherence rules (e.g., "Always match timezone to proxy geo")
- Default group for new profiles

#### Advanced

- Engine version (read-only, shows bundled fingerprint-chromium version)
- Local data path (where user-data-dirs are stored)
- Reset all profile cache
- Export workspace data (JSON dump)
- **Launch safeguards** (workspace-wide; admin-only). Defaults are ON for all four:
  - **Prevent concurrent profile sessions** — block opening a profile that someone else (or another machine) already has open. See §6.2.3.1 Safeguard A.
  - **Verify proxy before launch** — ping the proxy with a 3-second timeout before spawning Chromium. See §6.2.3.1 Safeguard B.
  - ⮡ **Block launch on proxy failure** (sub-toggle) — if OFF, shows a warning toast but launches anyway.
  - ⮡ **Block launch on egress IP mismatch** (sub-toggle) — if the proxy responds but reports a different IP than expected, block launch.

### 6.7 Extensions (`/extensions`)

Manage Chrome extensions to auto-install on profiles.

- List of extensions added to the workspace: name, version, "auto-install on new profiles" toggle, profile count using it, actions.
- Add extension:
  - **From Chrome Web Store URL** — paste URL, the system fetches the .crx
  - **Upload .crx file** — file picker
  - **Upload unpacked folder** — directory picker (zips into a .crx)
- Stored in Supabase Storage bucket `extensions/<workspace_id>/<extension_id>.crx`.
- On profile launch: main process copies enabled extensions into `<user-data-dir>/Default/Extensions/...` before spawning Chromium, OR uses `--load-extension=path1,path2,...`.
- Per-profile override: enable/disable specific extensions in the Profile Editor's Extensions section.

### 6.8 YouTube Tools (`/tools/...`)

This is the differentiator vs AdsPower. Skeleton for v1, real features in v2+.

For v1, scaffold pages with placeholder UI for:

- **Channel Manager** — list YouTube channels per profile (one channel per profile), monetization status, last upload date, basic analytics (later: pulls from YouTube Data API)
- **View Booster** — schedule profiles to watch specific videos with humanlike behavior (later: cron + headless engine)
- **Comment Tools** — bulk-post comments across N profiles with templating (later)
- **Analytics** — aggregated revenue/views across all profiles (later: requires YouTube API integration)

For v1, just build the navigation entries and an "Coming soon" placeholder for each. Real implementation post-launch.

### 6.9 Bulk Operations (cross-cutting)

Available from any list page (Profiles, Members):

- Select multiple via checkboxes
- "Bulk actions" dropdown appears at top of list when 1+ row selected
- Profile bulk actions: delete, move to group, add tag, remove tag, assign to member, launch all (max 50 at once with confirmation), export

---

## 7. Engine Integration (detailed)

### 7.1 Bundling

- Download fingerprint-chromium binaries for `darwin-arm64`, `darwin-x64`, `win32-x64`, `linux-x64`.
- Place in `engine/<platform>/`.
- electron-builder config includes them in the installer (extraResources).
- At runtime, resolve binary path:

```typescript
import { app } from 'electron';
import path from 'path';

function getEngineBinaryPath(): string {
  const platform = process.platform; // 'darwin' | 'win32' | 'linux'
  const arch = process.arch; // 'arm64' | 'x64'
  const platformDir = platform === 'darwin' ? `darwin-${arch}` : platform;
  const binaryName = platform === 'win32' ? 'chrome.exe' : 'Chromium';
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'engine')
    : path.join(__dirname, '../../engine');
  return path.join(base, platformDir, binaryName);
}
```

### 7.2 Flag builder

`electron/engine/flag-builder.ts`:

```typescript
export function buildFlags(profile: Profile, userDataDir: string, proxyServer: string): string[] {
  return [
    `--fingerprint=${profile.fingerprint_seed}`,
    `--fingerprint-platform=${profile.platform}`,
    `--fingerprint-platform-version=${profile.platform_version}`,
    `--fingerprint-brand=${profile.brand}`,
    `--fingerprint-brand-version=${profile.brand_version}`,
    `--fingerprint-hardware-concurrency=${profile.hardware_concurrency}`,
    profile.webgl_vendor && `--fingerprint-webgl-vendor=${profile.webgl_vendor}`,
    profile.webgl_renderer && `--fingerprint-webgl-renderer=${profile.webgl_renderer}`,
    `--lang=${profile.language}`,
    `--accept-lang=${profile.language},${profile.language.split('-')[0]}`,
    `--timezone=${profile.timezone}`,
    `--window-size=${profile.window_width},${profile.window_height}`,
    `--proxy-server=${proxyServer}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ].filter(Boolean) as string[];
}
```

### 7.3 Proxy auth (gost forwarder)

`electron/ipc/proxy-auth.ts`:

- For each launching profile that has proxy credentials, spawn a `gost` child process on a free localhost port.
- Track `{profileId -> {gostProcess, localPort}}` in a Map.
- Pass `http://127.0.0.1:<localPort>` to Chromium as `--proxy-server`.
- On profile close: kill gost process, free the port.
- Bundle gost binaries the same way as fingerprint-chromium.

### 7.4 Fingerprint generator

`src/lib/fingerprint-generator.ts`:

```typescript
const COHERENT_PROFILES = [
  // realistic Win10/Chrome configs
  { platform: 'windows', platform_version: '10.0.0', brand: 'Chrome', hardware_concurrency: 8, device_memory: 16, webgl_vendor: 'Google Inc. (NVIDIA)', webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { platform: 'windows', platform_version: '10.0.0', brand: 'Chrome', hardware_concurrency: 16, device_memory: 32, webgl_vendor: 'Google Inc. (Intel)', webgl_renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  // Mac M2/M3 configs
  { platform: 'macos', platform_version: '10_15_7', brand: 'Chrome', hardware_concurrency: 8, device_memory: 8, webgl_vendor: 'Google Inc. (Apple)', webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' },
  { platform: 'macos', platform_version: '10_15_7', brand: 'Chrome', hardware_concurrency: 12, device_memory: 16, webgl_vendor: 'Google Inc. (Apple)', webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)' },
  // ...
];

export function generateFingerprint(constraints?: { platform?: string }): FingerprintConfig {
  const candidates = constraints?.platform
    ? COHERENT_PROFILES.filter(p => p.platform === constraints.platform)
    : COHERENT_PROFILES;
  const base = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    ...base,
    fingerprint_seed: Math.floor(Math.random() * 100000),
    window_width: 1440, // common, can randomize from list later
    window_height: 900,
  };
}
```

Coherence rule: when proxy is selected, override `language` and `timezone` to match proxy IP geo (use a geo lookup library or TubeProxies API which already has this info per IP).

---

## 8. Database Schema (Supabase Postgres)

Run this as a single migration in Supabase SQL Editor.

```sql
-- Workspaces
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
  -- Launch safeguards (§6.2.3.1). All default to true (safe-by-default).
  -- Admin-only writes; enforced by RLS on workspaces.update.
  safeguard_block_concurrent boolean not null default true,
  safeguard_verify_proxy boolean not null default true,
  safeguard_block_on_proxy_failure boolean not null default true,
  safeguard_block_on_egress_mismatch boolean not null default true,
  created_at timestamptz default now()
);

-- Workspace members
create table workspace_members (
  workspace_id uuid references workspaces on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text check (role in ('owner', 'admin', 'manager', 'viewer')) not null,
  invited_by uuid references auth.users,
  joined_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- Groups
create table groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  name text not null,
  color text default '#6366f1',
  created_at timestamptz default now()
);

-- Profiles
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
  -- Concurrent-open lock (Safeguard A, §6.2.3.1).
  -- NULL session_id == not held. Heartbeat updates every 30s; locks older than 60s are stale.
  open_session_id uuid,
  open_by_user_id uuid references auth.users,
  open_by_device text,
  open_at timestamptz,
  open_heartbeat_at timestamptz,
  -- Proxy precheck (Safeguard B, §6.2.3.1). First successful launch records the egress IP
  -- so subsequent launches can detect proxy hijack / misconfiguration.
  last_known_egress_ip inet
);

-- Extensions
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

-- Activity log
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces on delete cascade not null,
  user_id uuid references auth.users,
  profile_id uuid references profiles on delete set null,
  action text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Indexes
create index idx_profiles_workspace on profiles(workspace_id);
create index idx_profiles_group on profiles(group_id);
create index idx_profiles_tags on profiles using gin(tags);
create index idx_members_user on workspace_members(user_id);
create index idx_activity_workspace on activity_log(workspace_id, created_at desc);
create index idx_extensions_workspace on extensions(workspace_id);

-- Updated-at trigger
create or replace function set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Unique-owner enforcement (one Owner per workspace)
create unique index workspace_members_one_owner
  on workspace_members (workspace_id) where role = 'owner';

-- RLS
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table groups enable row level security;
alter table profiles enable row level security;
alter table extensions enable row level security;
alter table activity_log enable row level security;

-- Lock down default function privileges (deny-by-default).
-- Without this, every helper function below is callable by `anon` via PostgREST.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Helper: workspaces the caller belongs to.
-- SECURITY DEFINER + empty search_path is mandatory: prevents search_path injection
-- attacks where a malicious schema shadows public.workspace_members.
create or replace function user_workspace_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select workspace_id from public.workspace_members where user_id = auth.uid()
$$;
grant execute on function user_workspace_ids() to authenticated;

-- Helper: caller's role in a given workspace. Used by all "manage" policies
-- to avoid self-referential RLS recursion on workspace_members.
create or replace function user_workspace_role(wid uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
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

-- Members policies (no inline self-reference: uses helper to avoid 42P17 recursion)
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

-- Activity log policies. Insert is pinned to user_id = auth.uid() so members
-- cannot spoof another user's actions in the audit trail.
create policy "members read activity" on activity_log for select
  using (workspace_id in (select user_workspace_ids()));
create policy "members write activity" on activity_log for insert
  with check (
    workspace_id in (select user_workspace_ids())
    and user_id = auth.uid()
  );

-- Plan-limit enforcement (server-side, non-bypassable).
-- Client-side checks are advisory only; this trigger is the source of truth.
-- Update the limits when pricing changes.
create or replace function enforce_profile_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

-- Auto-create workspace on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

-- =================================================================
-- Concurrent-open lock RPCs (Safeguard A, §6.2.3.1)
-- =================================================================
-- Stale-lock threshold: a lock is considered abandoned if the heartbeat
-- is older than 60 seconds (heartbeats fire every 30s from the main process).

create or replace function try_acquire_profile_lock(
  p_profile_id uuid,
  p_session_id uuid,
  p_device text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_held_session uuid;
  v_held_user uuid;
  v_held_device text;
  v_held_since timestamptz;
  v_held_heartbeat timestamptz;
begin
  -- Confirm caller has access to this profile (RLS-equivalent check).
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

  -- Atomic claim: only succeed if lock is unheld OR stale (heartbeat > 60s old).
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

  -- Lock contended — return who holds it.
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
language plpgsql
security definer
set search_path = ''
as $$
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
language plpgsql
security definer
set search_path = ''
as $$
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

-- Force-release: any session holder can be evicted by Owner/Admin.
create or replace function force_release_profile_lock(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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
```

### 8.1 Security checklist (must hold for every future migration)

- Every `SECURITY DEFINER` function has `SET search_path = ''` and fully-qualifies tables (`public.x`).
- Every new function gets an explicit `GRANT EXECUTE ... TO authenticated` (the default-privilege revoke above means functions are denied by default).
- No RLS policy queries the same table it's defined on inline. Push the lookup into a `SECURITY DEFINER` helper to avoid `42P17` recursion (precedent: Tubeproxies App migrations `008_fix_profiles_rls_recursion.sql` and `031_fix_team_rls_recursion.sql`).
- Service-role key is server-only. The Electron renderer must never see `SUPABASE_SERVICE_ROLE_KEY`; the preload throws if it does.
- Plan limits are enforced by DB triggers, not by the React client. Client UI is advisory; the DB is the source of truth.

---

## 9. Build Phases

### Phase 0 — Setup (Day 1, ~3 hours)

- Scaffold Electron + Vite + React + TS project at `/Users/julianpetersen/documents/github/tubeproxies-browser`
- Install deps (see section 10)
- Create Supabase project, run schema migration
- Read TubeProxies dashboard codebase, extract design tokens, copy Tailwind config + base components
- Drop fingerprint-chromium binaries into `engine/` per platform
- Apply for Apple Developer cert + Windows EV cert (paperwork only — runs in background)

### Phase 1 — Auth & Workspace (Day 2–3)

- Login + Signup pages (use TubeProxies dashboard auth UI as reference)
- Auth store (Zustand) + Supabase session management
- Workspace context: detect current workspace, allow switching
- Empty-state landing on Profiles page

### Phase 2 — Profiles core (Day 4–7)

- Profile list page with table, search, filters
- Profile editor side sheet (all sections from 6.2.2)
- Fingerprint generator function + "Generate New Fingerprint" button
- Engine launch via IPC (no proxy auth yet — manual proxies only for now)
- Status pill, last opened, activity log writes
- Sidebar + status bar shell

### Phase 3 — Groups, Tags, Members (Day 8–10)

- Groups page (CRUD)
- Tag input component + filters
- Members page + invite flow + role enforcement
- RLS-respect verification (test with two accounts)

### Phase 4 — TubeProxies integration (Day 11–13)

- TubeProxies API client (`src/lib/tubeproxies-api.ts`)
- Settings → TubeProxies tab (API key entry)
- Proxy picker dropdown in profile editor
- Auto-coherence (timezone/lang/geo)
- C-class subnet warning
- gost local forwarder for proxy auth

### Phase 5 — Extensions (Day 14–15)

- Extensions page (CRUD)
- Chrome Web Store URL fetcher (download .crx from store)
- Per-profile extension override
- Engine launch passes `--load-extension=` paths

### Phase 6 — Bulk + Settings + Billing (Day 16–18)

- Bulk profile creation page
- Settings tabs (General, Account, TubeProxies, Billing, Defaults, Advanced)
- Stripe integration + webhook → workspaces.plan
- Plan limits enforcement

### Phase 7 — YouTube Tools scaffold (Day 19)

- Sidebar second section
- Placeholder pages for Channel Manager, View Booster, Comment Tools, Analytics

### Phase 8 — Polish + ship (Day 20–22)

- Auto-update via electron-updater + Cloudflare R2
- Code signing (certs should be ready by now)
- Crash reporting (Sentry)
- Empty states, loading states, error toasts everywhere
- Build installers for Mac (Apple Silicon + Intel), Windows, Linux
- Closed beta to 10 friendly TubeProxies customers

### Phase 9 — Iterate (Day 23+)

- Fix what beta breaks
- Onboarding flow improvements
- Public launch to TubeProxies customer base

**Realistic timeline:** 4 weeks full-time focused, 8 weeks if juggling other ventures.

---

## 10. Setup Commands

Run these in `/Users/julianpetersen/documents/github/`:

```bash
mkdir tubeproxies-browser
cd tubeproxies-browser

npm create @quick-start/electron@latest . -- --template react-ts
npm install

npm install @supabase/supabase-js better-sqlite3 zustand
npm install lucide-react clsx tailwind-merge class-variance-authority
npm install date-fns react-hook-form zod @hookform/resolvers

npm install -D tailwindcss @tailwindcss/vite @types/better-sqlite3
# Tailwind v4 — no `tailwind.config.ts`, no PostCSS config.
# Add `@tailwindcss/vite` to vite.config.ts plugins, then create
# src/styles/globals.css and import it from main.tsx.
# Copy the @theme inline { ... } block verbatim from
# /Users/julianpetersen/Documents/GitHub/Tubeproxies App/dashboard/src/app/globals.css
# so the brand tokens (--color-brand-red, --color-brand-cream, etc.) match.

npx shadcn@latest init
npx shadcn@latest add button input dialog table select dropdown-menu \
  form label card badge tabs sheet command toast tooltip avatar \
  checkbox switch radio-group separator scroll-area popover

git init
echo "node_modules/
.env
out/
dist/
release/
*.log
engine/*/
!engine/.gitkeep" > .gitignore

mkdir -p engine/{darwin-arm64,darwin-x64,win32,linux}
touch engine/.gitkeep
```

Create `.env`:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxx...
VITE_TUBEPROXIES_API_BASE=https://api.tubeproxies.com
```

Generate types from Supabase:

```bash
npm install -D supabase
npx supabase login
npx supabase gen types typescript --project-id <your-project-id> > src/types/database.ts
```

---

## 11. Quality Bar

- **Type safety:** strict TypeScript, no `any` without justification, all DB queries typed via generated types.
- **RLS-only data access:** never use the service-role key on the client. All client queries hit Supabase with the user's JWT and RLS enforces scoping. Electron preload throws at startup if `SUPABASE_SERVICE_ROLE_KEY` is present in the renderer environment.
- **Hardened SECURITY DEFINER:** every such function uses `SET search_path = ''`, fully-qualifies tables, and is explicitly `GRANT EXECUTE ... TO authenticated` (default privileges are revoked).
- **DB-side plan enforcement:** plan and seat limits live in `BEFORE INSERT` triggers (`enforce_profile_limit`, `enforce_member_limit`). Client-side limit checks are UI hints only.
- **Input validation at boundaries:** Zod schemas validate every IPC message and every Supabase RPC payload. Mirrors `dashboard/src/lib/security/validation.ts`.
- **Optimistic UI:** profile changes update local state immediately, then persist to Supabase. Revert on error with toast.
- **Realtime:** subscribe to `profiles` and `workspace_members` changes for the current workspace. Other team members' edits appear within 1s.
- **Offline tolerance:** cache last-fetched data in better-sqlite3. App opens to last-known state if Supabase is unreachable; sync resumes on reconnect.
- **Performance:** profile list virtualized at 100+ rows. Bulk operations run in batches of 50 with a progress indicator.
- **Visual fidelity:** matches TubeProxies dashboard. Same fonts, same colors, same spacing, same component primitives. If a component already exists in the dashboard, copy it; don't re-implement.
- **Accessibility:** keyboard navigation throughout, ARIA labels on icon buttons, focus rings, contrast ratios meet WCAG AA.

---

## 12. Non-Goals (v1)

Park these. Build only when customer demand is proven.

- Mobile (iOS/Android) fingerprint emulation
- Headless / automation API
- Cloud profiles (browser running on a remote server)
- Cookie/session sync between team members
- Multi-language UI (ship English-only)
- Synchronizer (master replays to children)
- Browser extensions marketplace
- Native browser engines other than Chromium

---

## 13. Open Questions for Julian

(Claude Code: ask these before implementing if relevant.)

1. Confirm exact path to TubeProxies dashboard codebase. Listed here as `/Users/julianpetersen/documents/github/Tubeproxies App/dashboard` — verify before reading.
2. Does the TubeProxies API expose an endpoint for listing a user's available IPs? If yes, what's the path and auth scheme? If no, we need to build it.
3. What's the TubeProxies pricing tier mapping for the "Free with TubeProxies Browser" perk? (i.e., which tubeproxies plans get the browser free?)
4. Stripe vs Lemon Squeezy for billing? (LS handles EU VAT automatically, Stripe is more flexible.)
5. Default plan limits: how many profiles on free, how many on $29/mo paid?
6. Do you want Google OAuth on login from Day 1, or email/password only?

---

## 14. Reference Links

- fingerprint-chromium: https://github.com/adryfish/fingerprint-chromium
- Supabase docs: https://supabase.com/docs
- shadcn/ui: https://ui.shadcn.com
- Electron: https://electronjs.org/docs
- gost (proxy forwarder): https://github.com/ginuerzh/gost

---

**End of plan. Build phase by phase. Reference TubeProxies dashboard for UI fidelity at every step.**
