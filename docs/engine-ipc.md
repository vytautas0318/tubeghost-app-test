# Engine IPC contract

The interface between the renderer and the main-process engine. **This is the handoff Plan A (TubeProxies API integration) depends on.** Once a TubeProxies-API-assigned proxy is resolved to `{type, host, port, username, password}`, it feeds into `window.api.profiles.launch()` exactly the same way a manual proxy does.

> **Stability note:** treat this as a stable contract. Changes here ripple through `LaunchButton.tsx`, `profile-launch.ts`, `launchStore.ts`, the Profiles page, and any future migration tool. Bump versions deliberately.

---

## Channels exposed by `window.api.profiles`

All channels are typed in [src/preload/index.d.ts](../src/preload/index.d.ts).

### `launch(req): Promise<LaunchResult>`

Acquire the lock (renderer side, via `try_acquire_profile_lock`), then call this. The main process spawns gost (if proxy), runs the precheck, spawns chromium, attaches CDP shims, and resolves with the result.

```ts
interface LaunchRequest {
  profileId: string
  sessionId: string                    // UUID v4 generated client-side
  profile: LaunchProfileFields         // see below
  proxy: LaunchProxy | null            // null = direct connection
  acceptEgressMismatch?: boolean       // user opted in after the first attempt warned
}

interface LaunchProxy {
  proxy_type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username: string | null              // null = no auth needed
  password: string | null              // null = no auth needed
  expected_egress_ip: string | null    // last-known egress; mismatch → confirm
}

type LaunchResult =
  | { ok: true; sessionId: string; pid: number; egressIp: string | null }
  | { ok: false; reason: 'engine-missing' }
  | { ok: false; reason: 'proxy-precheck'; stage: string; error: string }
  | { ok: false; reason: 'egress-mismatch'; currentIp: string; expectedIp: string }
  | { ok: false; reason: 'engine-crashed'; logTail: string; logPath: string }
  | { ok: false; reason: 'unknown'; error: string }
```

**`LaunchProfileFields`** is a subset of `ProfileRow` containing only the fields the engine actually consumes. See [src/preload/index.d.ts](../src/preload/index.d.ts) for the full list — 41 fields. The renderer's [profile-launch.ts:profileToLaunchFields()](../src/renderer/src/lib/profile-launch.ts) is the canonical mapper.

**`sessionId` semantics:** must match the `p_session_id` passed to `try_acquire_profile_lock` *before* `launch` is called. Heartbeats and lock release use the same id. Generate fresh per launch attempt.

### `close(profileId): Promise<void>`

Send `SIGTERM` to chromium. Main escalates to `SIGKILL` after 3s. Idempotent — closing an already-closed profile is a no-op. Lock release happens via the renderer's heartbeat hook reacting to the `exited` event, not in `close()` itself.

### `listRunning(): Promise<RunningProfile[]>`

Returns the in-memory child-process map. Used at boot to reconcile against DB locks.

```ts
interface RunningProfile {
  profileId: string
  sessionId: string
  pid: number
  startedAt: string  // ISO
}
```

### `deviceIdentity(): Promise<DeviceIdentity>`

Returns the per-machine device label that's stored in `profiles.open_by_device` so the UI can render `"In use on Julian's MacBook"` on rows held by another device.

```ts
interface DeviceIdentity { id: string; label: string }
```

### `drainPendingReleases(): Promise<string[]>`

Boot-recovery only. Reads + clears the disk-staged session-id list written by `before-quit` if the renderer exited before main finished cleanup. Renderer immediately calls `bulk_release_locks_for_session(ids)` against Supabase.

### `onPhase(cb)` / `onExited(cb)` — event subscriptions

Returns an unsubscribe function. Subscribe once at app boot (see [launchStore.ts](../src/renderer/src/store/launchStore.ts)).

```ts
interface PhaseEvent {
  profileId: string
  phase: 'preflight' | 'starting-bridge' | 'precheck' | 'starting-engine' | 'ready' | 'exited'
}

interface ExitedEvent {
  profileId: string
  sessionId: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  logPath: string
}
```

`onPhase` fires throughout the launch lifecycle. `onExited` fires once when chromium dies (clean close *or* crash). The exited event is also what triggers lock release in `useLaunchHeartbeats()`.

---

## Phase ordering

```
preflight             Renderer just acquired the lock; main is checking engine install status
  ↓
starting-bridge       gost subprocess spawning (only if proxy != null)
  ↓
precheck              proxy-test running an egress-IP probe through gost
  ↓                   (may fail with 'proxy-precheck' or 'egress-mismatch')
starting-engine       chromium spawning + CDP shim injection
  ↓
ready                 chromium window open, lock heartbeat starts firing
  ↓
exited                chromium child process exited (any reason)
```

Any phase can transition straight to `exited` if the chromium process dies early — the 1.5s early-exit detector in `session-manager.ts` catches install/dyld failures and surfaces them as `{ ok: false, reason: 'engine-crashed' }` instead of leaving the UI hanging.

---

## Channels exposed by `window.api.engine`

Used by the install flow (first-time launch). Not strictly part of the launch contract but lives nearby.

```ts
engine.status(): Promise<EngineStatus>
engine.install(): Promise<EngineInstallResult>
engine.cancel(): Promise<void>
engine.revealLogs(): Promise<void>           // open log dir in Finder/Explorer
engine.revealInstall(): Promise<void>        // open engine root dir
engine.runDiagnostic(profileId): Promise<DiagnosticResult>
engine.onProgress(cb): () => void            // download/extract progress stream
```

---

## Lock + heartbeat round-trip

The lock state lives in `profiles.open_session_id` / `open_by_user_id` / `open_by_device` / `open_at` / `open_heartbeat_at`. The renderer is the *only* caller of the lock RPCs — main never touches Supabase.

```
Renderer                                    Main
────────                                    ────
try_acquire_profile_lock(profileId,
                         sessionId,
                         deviceLabel)
  → returns { acquired: true } or
    { acquired: false, held_by_user, ... }

  if acquired:
    profiles.launch({ profileId, sessionId, profile, proxy })
                                            spawn gost
                                            run proxy-test
                                            spawn chromium (early-exit detector)
                                            attach CDP shims
                                            ←── return { ok: true, pid, egressIp }
    update_profile_egress_ip(...)
    setInterval(heartbeat, 30s)
                                            (every chromium frame: nothing)
                                            (gost stays alive alongside chromium)

  every 30s:
    update_profile_heartbeat(profileId, sessionId)

  user clicks Close:
    profiles.close(profileId)
                                            child.kill('SIGTERM')
                                            (3s grace) child.kill('SIGKILL') if still alive
                                            child.once('exit', ...)
                                              → stopGost(profileId)
                                              → broadcast 'profiles:exited'
    onExited:
      release_profile_lock(profileId, sessionId)
      clearInterval(heartbeat)
```

### Stale-lock recovery — three layers of defense

1. **`try_acquire_profile_lock`'s 60-second window** — if the previous holder's heartbeat is older than 60s, the next attempt steals the lock atomically. Heartbeat fires every 30s so 60s is 2× margin.
2. **Boot reconciliation** — `recoverLaunchState()` lists locally-running pids vs. DB locks for the current user; orphans get bulk-released.
3. **Disk-staged release list** — `before-quit` writes session IDs to disk in case the renderer dies before draining. Next boot picks them up.

Together these mean a crashed renderer / killed chromium / ungraceful quit / OS crash all converge to "next launch attempt for that profile succeeds" within at most 60s.

### Force-unlock

`force_release_profile_lock(profileId)` requires `profiles.force_unlock` permission (admin/owner). Writes an `activity_log` row with `action='force_unlocked'` for audit. Bypasses the heartbeat-staleness check — used when a workspace admin needs to reclaim a profile that's stuck open on someone else's offline device.

---

## How Plan A plugs in

When Plan A wires the TubeProxies-managed proxy picker into the profile editor, the path is:

1. User selects a TubeProxies proxy → `profiles.proxy_id` set; the `proxies` row carries `host`, `port`, `username`, `password`, etc.
2. On Launch, `profileToProxy()` in [profile-launch.ts](../src/renderer/src/lib/profile-launch.ts) reads either `profile.proxy_*` (custom inline) or joins through `proxy_id` (TubeProxies) and produces the same `LaunchProxy` shape. **No changes needed to this contract.**

The only new field Plan A might want is a "managed" flag on `LaunchProxy` so main can log "TubeProxies-IP-id #abc" alongside the host:port for support diagnostics. Adding that is non-breaking (renderer omits, main treats as `undefined`).

---

## Versioning

Treat this contract as v1. Breaking changes (renaming a field, changing a type) bump to v2 and require a coordinated update across:

- [src/preload/index.ts](../src/preload/index.ts) + [src/preload/index.d.ts](../src/preload/index.d.ts)
- [src/main/sessions/session-manager.ts](../src/main/sessions/session-manager.ts)
- [src/main/ipc/profiles-launch.ts](../src/main/ipc/profiles-launch.ts)
- [src/renderer/src/lib/profile-launch.ts](../src/renderer/src/lib/profile-launch.ts)
- [src/renderer/src/store/launchStore.ts](../src/renderer/src/store/launchStore.ts)
- This doc.

Non-breaking additions (new optional field, new error reason variant, new phase) can land in a single PR with a one-line CHANGELOG note.
