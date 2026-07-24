# Engine end-to-end smoke test

Manual checklist to run **once** to confirm the launch round-trip works after gost binaries land. Subsequent regressions get caught by automation later. ~30 minutes start-to-finish.

## Status (2026-05-04)

- ✅ Test 1 (no-proxy launch) — passed, ipify shows home IP
- ✅ Test 2 (HTTP-auth proxy via gost) — passed, browserscan 100%
- ✅ Test 3 (fingerprint match) — passed after `--timezone` + `--fingerprint-gpu-*` flag rename and timezone-resolver fallback (browserscan 100%, no `-10% Different time zones`)
- ⏳ **Test 4** (proxy precheck failure path) — **next**
- ⏳ **Test 5** (force-quit chromium → recovery) — **next**
- ⏭️ Test 6 (multi-device lock) — skip unless you have a second account
- ⏳ **Test 7** (app-quit cleanup) — **next**
- ⏳ **Test 8** (random-fingerprint-on-startup) — **next**

Run 4, 5, 7, 8 in order — each takes 1-2 min. Tests 5/7 need a terminal handy.

## Pre-reqs

- `npm run dev` running (Electron app open, signed in to a workspace with `profiles.launch` permission)
- A working HTTP-with-auth proxy you can use for testing. Any provider works — IPRoyal, Smartproxy, Bright Data trial, even your TubeProxies proxy if you have one set up. **You need real creds; no proxy = can't validate gost auth forwarding.**
- A second Supabase account in the same workspace (for the multi-device lock test). Skip if you don't have one — it just means step 6 is unverified.

---

## Test cases

### 1. Launch with no proxy (sanity)

- Profiles → New profile → leave proxy blank → Save
- Click Launch
- **Expect:** chromium window opens. Browse to `https://api.ipify.org` — IP shown is your home IP (no proxy).
- Close the window. The "Close" button reverts to "Launch."
- **Confirms:** chromium spawn works, lock acquire/release cycle works, `LaunchProxy` `null` path works.

### 2. Launch with HTTP-auth proxy (the gost test)

- Edit the profile. Set `proxy_type=http`, `host`, `port`, `username`, `password`.
- Save.
- Click Launch.
- **Expect:** the launch pill cycles `preflight → starting-bridge → precheck → starting-engine → ready` (visible in the UI for a few seconds total).
- **Expect:** chromium opens. **No proxy auth dialog appears.**
- Browse to `https://api.ipify.org` — IP shown is the **proxy's egress IP**, not your home IP.
- **If you see a "Proxy authentication required" dialog:** gost is running but auth forwarding isn't working. Check log output (`Reveal logs` from a row's More menu).
- **Confirms:** gost subprocess works, credentials reach upstream, chromium connects through it cleanly.

### 3. Verify fingerprint match

- With the same launched profile, browse to `https://browserscan.net`.
- **Expect:** match score ≥ 95%. Anything lower means a fingerprint flag isn't being applied — list the mismatched rows for diagnosis.
- Browse to `https://amiunique.org` — confirm Timezone, Language, WebGL Vendor / Renderer all match what you set in the profile editor.
- **Confirms:** `flag-builder.ts` + the CDP shims are doing their job.

### 4. Verify proxy precheck failure path

- Edit the profile. Change `port` to `1` (a port nothing listens on).
- Click Launch.
- **Expect:** toast says `Proxy connect: <error>` and chromium does NOT open. Pill returns to idle.
- Restore the correct port.
- **Confirms:** the precheck blocks bad proxies before spawning the engine.

### 5. Force-quit chromium → next launch recovers

- Click Launch. Wait for chromium to open.
- In a terminal: `pgrep -fl Chromium` → find the PID → `kill -9 <PID>`.
- The launch pill in TubeProxies should fade out (`exited` event).
- Click Launch again.
- **Expect:** launches successfully. The previous lock is reclaimed via the 60-second stale window — no force-unlock needed.
- **Confirms:** stale-lock recovery works.

### 6. Multi-device lock (skip if you don't have a second account)

Open the same workspace from a second device or browser session, signed in as a different user. Both users hold `profiles.launch`.

- Device A: click Launch on profile X. Chromium opens.
- Device B: refresh Profiles list. The row shows the `IN USE` badge with Device A's initials.
- Device B: click Launch on profile X.
- **Expect:** toast `In use on <Device A>. Use Force unlock if you're sure it's stale.` — chromium does NOT open.
- Promote Device B's user to admin if needed. Open the row's More menu → Force unlock.
- Device B: click Launch again.
- **Expect:** opens cleanly on Device B. Device A's chromium might still be running (force unlock doesn't kill remote chromiums) but its lock is released.
- **Confirms:** cross-device lock works + force-unlock path works.

### 7. App quit while chromium is running

- Click Launch. Chromium opens.
- Quit TubeProxies via Cmd+Q (or the X button on Windows).
- **Expect:** chromium closes within ~3 seconds (SIGTERM grace, then SIGKILL).
- Reopen TubeProxies. Wait for the Profiles list to load.
- **Expect:** the row shows no `IN USE` badge (lock was released via the disk-staged drain on next boot).
- Click Launch on the same profile.
- **Expect:** opens normally.
- **Confirms:** app-quit cleanup + boot recovery work.

### 8. Random-fingerprint-on-startup

- Edit the profile. Toggle "Randomize fingerprint on each startup" → ON. Save.
- Click Launch. Wait for chromium.
- Browse to `https://amiunique.org`. Note the User-Agent + WebGL Renderer.
- Close chromium.
- Click Launch again. Wait. Browse to amiunique.org.
- **Expect:** User-Agent and WebGL Renderer **changed** between the two sessions.
- **Confirms:** the renderer's pre-launch randomization persists + the engine picks up the new values.

---

## What to do if any test fails

- **gost-related** (any "proxy auth required" dialog, gost-spawn errors): check `~/Library/Application Support/TubeProxies Browser/logs/<profileId>/...` — gost stderr is teed there.
- **Engine crash early**: the toast → modal shows the crash log tail. Common causes: chromium quarantine attribute (mac), missing user-data-dir permission.
- **Lock issues**: SQL editor against the workspace's `profiles` table → check `open_session_id` / `open_heartbeat_at` columns. Stale lock should clear within 60s of the heartbeat stopping.
- **Status pill stuck**: probably a missed `profiles:phase` event. Check DevTools console for `[launchStore] window.api.profiles unavailable` — that means the preload bundle is stale, restart `npm run dev`.

---

## After these all pass

- Mark Phase B complete in `~/.claude/plans/tubeproxies-B-engine-launch-end-to-end.md`
- Plan A can begin in a separate chat, referencing `docs/engine-ipc.md` for the launch contract.
