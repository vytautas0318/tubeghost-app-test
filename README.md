# TubeProxies Browser

Electron desktop app that manages isolated browser profiles backed by
the TubeProxies proxy network. Each profile launches a separately-
fingerprinted Chromium instance with its own cookies, cache, and
egress IP.

## Project setup

```bash
npm install
npm run dev
```

`npm run dev` starts Vite (renderer hot reload) + the Electron main
process. The first launch needs Supabase env vars in `.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Windows — Defender exclusion before `npm install`

`postinstall` downloads `gost.exe` (the proxy bridge) into
`resources/gost/win32-x64/`. Windows Defender flags it as "potentially
unwanted software" — a false positive that hits most Go-based proxy
binaries — and quarantines the file during extraction. Without an
exclusion, both `npm install` and runtime profile launches will fail.

Run this **once** in an elevated PowerShell, then `npm install`:

```powershell
Add-MpPreference -ExclusionPath "<repo>\resources\gost"
Add-MpPreference -ExclusionPath "<repo>\.tmp"
```

If you already hit the failure (`gost binary not found at …`), add
the exclusions and re-run `node scripts/download-gost.mjs`.

## Build

```bash
npm run build:mac       # macOS Apple Silicon
npm run build:win       # Windows x64
```

Linux is not supported in v1.

## First profile launch — what happens

The browser engine (Chromium, ~130 MB) is downloaded on demand the
first time you click **Launch** on a profile. It lives under your OS
userData dir (see paths below) and is reused for every subsequent
launch. You can pre-download it from **Settings → Engine** if you'd
rather not wait when launching the first profile.

### macOS — first launch warning

The downloaded engine binary is **not signed by us**. The installer
auto-strips the macOS Gatekeeper quarantine attribute so you should
not see the "Chromium can't be opened because Apple cannot check it"
sheet. If you do (because Terminal lacks Full Disk Access, or the
xattr command failed), do this once:

1. Right-click the Chromium app under
   `~/Library/Application Support/tubeproxies-browser/engine/darwin-arm64/<version>/Chromium.app`
2. Choose **Open**
3. Confirm "Open" in the warning sheet

After that single override, all subsequent launches succeed silently.

### Windows — first launch warning

Windows SmartScreen will pop **"Windows protected your PC"** the
first time the unsigned engine binary runs. Click **More info →
Run anyway**. This is one-time per engine version.

If your antivirus quarantines the binary (common with heuristic
scanners on Chromium forks), add this folder to your AV exclusions:

```
%APPDATA%\tubeproxies-browser\engine\win32-x64\
```

## Where data lives

| Kind | macOS | Windows |
|---|---|---|
| Engine binary | `~/Library/Application Support/tubeproxies-browser/engine/darwin-arm64/<v>/` | `%APPDATA%\tubeproxies-browser\engine\win32-x64\<v>\` |
| Per-profile data dir | `…/tubeproxies-browser/profiles/<profileId>/` | same path under APPDATA |
| Engine logs | `…/tubeproxies-browser/logs/engine/<profileId>-<ts>.log` | same |
| Device ID | `…/tubeproxies-browser/device-id.json` | same |

You can wipe and reset by quitting the app and deleting any of these
folders.

## How to reset a stuck launch

If the in-app **Force unlock** button isn't available (you lack the
permission) or doesn't help:

1. **Wait 60 seconds.** A profile heartbeat hasn't been seen in 60s
   counts as stale; the next launch attempt automatically takes over.
2. **Quit the app and relaunch.** On boot, TubeProxies Browser drains
   any orphaned locks for this device.
3. As a last resort, an admin can clear the `open_session_id` column
   directly via Supabase. Don't `DELETE FROM profiles` — you'll lose
   the row.

## Active development phase

Phase 4 (engine integration) just landed. Next:

- Phase 5: extension management, automation/scripting hooks
- Phase 6: production code-signing for both platforms

## Recommended IDE setup

[VSCode](https://code.visualstudio.com/) +
[ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) +
[Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
