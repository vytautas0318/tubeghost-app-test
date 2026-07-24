# Profile Consistency Architecture

> Goal: make every value the browser exposes derive from **one canonical profile
> model**, so all surfaces are mutually coherent by construction. This is an
> implementation‑quality / correctness document, **not** an evasion guide. The
> guiding rule is *architectural consistency over spoofing* — never change a
> value only to satisfy a detector. "Masking detected" and "automated behavior
> detected" are treated here as **symptoms of internal incoherence or runtime
> incorrectness**, and fixed at the architecture level.

Grounded in the current engine: `fingerprint_manager.cc`, the `--fingerprint-*`
switches, patches `022` (screen) / `024` (viewport+media) / `040` (noise
killswitch) / `041` (DPR) / `042` (window cluster), and the launcher modules
`fingerprint-config.ts`, `flag-builder.ts`, `coherence.ts`, `gpu-presets.ts`,
`ip-timezone.ts`, `session-manager.ts`.

---

## 1. Consistency architecture

### Canonical profile model

A single immutable struct, created once at profile creation, persisted with the
profile, and **the only source** every surface reads from. Categories:

| Category | Canonical fields |
|---|---|
| **OS identity** | `platform`, `os_version`, `arch`, `bitness` |
| **Display** | `panel_class`, `physical_res`, `logical_res`, `dpr`, `color_depth`, `avail_layout` (menubar‑top vs taskbar‑bottom), `avail_reduction` |
| **Graphics** | `gpu_vendor`, `gpu_renderer`, `webgl_params{}`, `webgl_extensions[]`, `webgpu_adapter` |
| **Localization** | `ui_language`, `languages[]`, `accept_language`, `timezone` (IANA), `locale` |
| **Hardware** | `cores` (hardwareConcurrency), `device_memory`, `max_touch_points`, `pointer/hover` |
| **Browser capability** | `chrome_full_version`, `ch_brands[]`, `feature_set`, `codecs[]` |
| **Network** | `egress_ip`, `geo`, `webrtc_mode`, `connection{}` |

### Dependency graph (DAG)

Five **roots**; everything else is derived. An edge `A → B` means "B must be
regenerated when A changes, and B must remain consistent with A."

```
 ROOTS:  platform     device_archetype(chip)     egress_ip     chrome_version     seed
            │                  │                      │               │             │
   ┌────────┼───────┐   ┌──────┼─────────┐       ┌────┴─────┐    ┌────┴────┐        │
   ▼        ▼       ▼   ▼      ▼         ▼       ▼          ▼    ▼         ▼         ▼
os_version  UA   nav.platform gpu_vendor/    panel_class  timezone  ch_brands  feature_set  (stable
   │        │    Sec-CH-       renderer          │          │          │          │          tie-break
   ▼        ▼    Platform      │  │  │       physical_res  languages  UA full-   codecs       only —
avail_layout│   ┌──┘ │  │      │  │  └─webgpu_adapter │      │        version-list │          NOT noise)
(menubar vs │   │   plugins fonts │  └─webgl_params   │   accept_lang  │           │
 taskbar)   └───┴──── path sep ───┘                logical_res        geo         maxTouchPoints
   │                              cores_range ──► cores  │ dpr ──► resolution(dppx)
   ▼                              memory_range ─► device_memory │
avail_reduction ──► screen.avail* ──► window cluster (outer/inner/screenX/visualViewport/client)
```

### The invariant edges (violating any one = "masking")

1. `gpu_renderer` OS token **==** `platform` (Apple GPU ⇒ macOS; NVIDIA ⇏ Apple Silicon).
2. `(platform, chip)` is a **real device**, and `physical_res` ∈ that device's panels (or a real scaled mode of one). *— the "M2 + 3024×1964" impossible Mac.*
3. `screen.width × dpr == physical_res`, integer; `matchMedia(device-width) == screen.width`; `matchMedia(resolution dppx) == dpr`.
4. `innerWidth == visualViewport.width == clientWidth ≤ outerWidth ≤ availWidth ≤ screen.width` (patch 042). Heights analogous.
5. `avail_layout` matches OS (mac: `availTop>0`; Windows: `availTop=0`, bottom strip).
6. `webgl_renderer` GPU family **==** `webgpu_adapter` GPU family (no Intel‑WebGL / AMD‑WebGPU). WebGPU present **iff** WebGL present.
7. `UA` ⟷ `navigator.platform` ⟷ `Sec-CH-UA-Platform` ⟷ `Sec-CH-UA-Platform-Version` all name the **same OS + a real build**.
8. `chrome_full_version` **==** `Sec-CH-UA-Full-Version-List` **==** UA version.
9. `timezone` is derived from `egress_ip` geo; `Date offset` + DST coherent.
10. `languages[0]` base **==** `Accept-Language` q=1 **==** `Intl` locale; soft‑matches `geo` country.
11. **Every above value is identical across window / worker / iframe / service‑worker / GPU process.**

---

## 2. Validation engine

`coherence.ts` is the seed of this. Generalize it to: `validate(model) → { score,
violations[], regen_plan }`.

### Validation rules (predicate → severity)

| ID | Rule | Severity |
|---|---|---|
| R1 | `gpu_renderer` OS token == `platform` | HARD |
| R2 | `(platform, chip, physical_res)` ∈ device table | HARD |
| R3 | `physical == logical × dpr`, integer; `dpr` ∈ platform set (mac built‑in = {2}) | HARD |
| R4 | `avail_layout` matches OS | HARD |
| R5 | `cores` ∈ chip thread‑count set | SOFT |
| R6 | `device_memory` ∈ {0.25,0.5,1,2,4,8} and plausible for tier | SOFT |
| R7 | `timezone` valid IANA for `geo` country; offset/DST coherent | HARD |
| R8 | `languages[0]` == `accept_language` head; soft‑match `geo` | SOFT |
| R9 | `chrome_full_version` == CH brands == UA version | HARD |
| R10 | `webgpu_adapter` family == `webgl_renderer` family | HARD |
| R11 | `max_touch_points` coherent with platform/pointer (desktop = 0) | SOFT |
| R12 | window cluster ordering (inv. #4) | HARD |

### Dependency relationships → regeneration order

Topological order of the DAG; on a root change, regenerate **only downstream**:

- **platform changed** → `{os_version, UA, nav.platform, CH-Platform, avail_layout, dpr_default, fonts, plugins}` then **re‑select** `device_archetype` (GPU must be valid for the new OS) → cascade to graphics + display.
- **egress_ip changed** → `{timezone, languages, accept_language, geo}` **only**. Display/graphics untouched.
- **device_archetype changed** → `{gpu_vendor/renderer, webgl_params, webgpu_adapter, panel_class→physical_res, cores_range→cores, memory_range→device_memory}`.
- **chrome_version changed** → `{UA full version, CH brands, feature_set, codecs}`.

Regeneration is **minimal** (only dependents) and **deterministic** (seeded), so
editing one axis never perturbs an unrelated axis → profile stability.

### Failure examples (rejected impossible combinations)

```
✗ Apple M2 GPU  +  screen 3024×1964            (14" panel ⇒ M‑Pro/Max)       R2
✗ macOS UA      +  NVIDIA GeForce renderer     (impossible pairing)          R1
✗ dpr 2         +  physical_res 1792×1120·1.8  (fractional → non‑integer)    R3
✗ Windows       +  availTop 25 (menubar layout)                              R4
✗ tz America/Denver  +  egress IP geolocates Central                         R7
✗ WebGL Intel UHD 630  +  WebGPU AMD Radeon     (dual‑GPU leak)              R10
✗ visualViewport.width 1633  +  innerWidth 1470 (inner>outer artifact)       R12
✗ UA Chrome 148  +  Sec-CH-UA-Full-Version 120                               R9
```

---

## 3. Browser‑surface audit

The **architectural advantage** of this engine: spoofs live in Blink C++ (read
from the process‑wide command line), not JS injection. That makes the values
*native at the source*, which eliminates the entire JS‑injection failure class
(property descriptors, function identity, worker/iframe gaps). The residual risk
is **cross‑surface coherence**, which §2 handles. Per surface:

| Surface | Expected invariant | Common implementation mistake | Diagnostic |
|---|---|---|---|
| **navigator.*** | All fields from canonical; `platform` matches UA OS; `webdriver` **false** | UA spoofed but `platform`/`webdriver` not; workers leak real values | Cross‑context dump (window vs worker vs SW) |
| **UA + Client Hints** | UA == CH brands == full‑version‑list; Platform‑Version is a **real build** for the OS; `mobile=?0` desktop | Platform‑Version leaks host build (the Win "10.0.19045" on macOS bug); `userAgentData.platform` ≠ `navigator.platform` | Parse UA + all CH + `userAgentData`, assert equal |
| **Screen/window** | inv. #3/#4; `color_depth==pixel_depth==24` | DPR left real (fractional in scaled modes); visualViewport mirrors *screen* not *innerWidth*; window > avail | `screen-fingerprint-audit.html` (already built) |
| **WebGL** | renderer matches OS; numeric params match that GPU's driver; same in OffscreenCanvas worker | Renderer string spoofed but host's numeric params left (matched‑preset bug); pixels ≠ claimed renderer (cross‑OS) | Dump all `getParameter` + extensions vs claimed preset |
| **WebGPU** | adapter == WebGL GPU family; present iff WebGL | discrete‑GPU adapter while WebGL uses iGPU (force‑low‑power fixes) | `requestAdapter().info` vs WebGL renderer |
| **Canvas** | **Deterministic, stable** — genuine GPU output, *no noise* | Per‑call noise → flagged via hash‑uniqueness (killswitch patches 039/040) | Read same canvas twice → identical hash |
| **Media** | codec support matches platform/build; `mediaCapabilities` == `canPlayType` | Claiming codecs the build lacks | Enumerate `canPlayType` matrix |
| **Audio** | Deterministic, stable; plausible `sampleRate` | Audio noise injection (always‑off now) | Render audio FP twice → identical |
| **Permissions** | `permissions.query` coherent with concrete API (`Notification.permission`) | The classic notification‑state mismatch | Cross‑check query vs concrete state |
| **Locale/timezone** | JS tz == IANA(egress IP); offset/DST coherent; Intl == languages | tz from host not proxy; Intl ≠ navigator.language | `Date` offset vs IANA vs IP geo |
| **Worker** | **All** navigator.* identical to window (WorkerNavigator shares mixins) | window spoofed, WorkerNavigator not | Worker postMessage navigator dump vs window |
| **iframe** | All values identical in nested + cross‑origin + `about:blank`/`data:` frames | JS‑injection misses fresh frames (engine‑level is immune) | Nested/cross‑origin iframe dump |
| **Service Worker** | SW navigator + intercepted CH headers match | SW not covered by JS injection | Register SW, report navigator + headers |
| **GPU process** | Same canonical GPU (switches are process‑wide); real pixels match claimed renderer | Per‑renderer spoof not reaching GPU process; cross‑OS pixels can't match | `chrome://gpu` vs claimed (internal) |
| **Feature exposure** | Feature set matches claimed Chrome+platform; `window.chrome` present | Over‑hardening removes features a real Chrome has → anomalous set | Feature‑set hash vs reference Chrome |
| **Property descriptors** | Spoofed prop on the **prototype**, native getter (`[native code]`), native flags | JS `defineProperty` → non‑native descriptor / JS getter toString | Per‑prop: location (prototype), `get.toString()` nativeness |
| **Function identity** | Native functions report `[native code]`; `Function.prototype.toString` intact | Proxy/JS shims detectable via toString/stack | toString‑integrity suite |

### "Automated behavior detected" — as a correctness issue

A user‑driven browser should not present automation markers that **contradict
the reality** that a human is driving it. Treat these as incorrectness, not
evasion:

- `navigator.webdriver` must be `false` for a user‑driven launch (it is *true*
  only under WebDriver/CDP control — which this product is not).
- `window.chrome` and the expected runtime objects must exist (their absence is
  an anomaly relative to real Chrome).
- The anti‑automation build disables CDP — verify that disabling it doesn't
  itself create an anomalous/inconsistent runtime (missing expected globals).
- Permission/notification coherence (above).

---

## 4. Instrumentation

**Structured logging schema** (extend the existing `[fp_mgr] loaded …` line):

```json
{ "profile_id": "…", "model_hash": "sha256:…", "schema_version": 3,
  "surface": "screen|navigator|webgl|…", "context": "window|worker|iframe|sw|gpu",
  "values": { … }, "derived_from": ["platform","device_archetype"], "ts": 0 }
```

**Consistency score**: `score = 100 − Σ(violation_weight)`; any HARD violation →
fail (below threshold). Report per‑category sub‑scores.

**Mismatch report**: `{ rule_id, severity, expected, actual, surfaces[],
derived_from[], suggested_regeneration }` — machine‑readable.

**Replay tools**: `replay(model_hash)` re‑derives the full profile from
`(canonical_model, seed, generator_version)` and diffs against the stored
snapshot → catches non‑determinism / drift. Requires pinned generator version +
seed; **no `Date.now`/`random` in generation**.

**Regression tests**: a profile matrix (platform × chip × resolution × locale)
as golden snapshots. A test driver launches each, collects window/worker/iframe/
SW dumps, runs `validate()`, asserts `score ≥ threshold` and 0 HARD violations.
`screen-fingerprint-audit.html` is the manual analogue — automate it via a
test‑only dump‑to‑file hook (CDP is disabled by design, so use a file/localhost
beacon, not the debugger).

---

## 5. Chromium integration plan

**Where state lives.** The canonical model is owned by the **launcher** (Electron
main), persisted with the profile. It is serialized to `--fingerprint-config`
JSON + discrete `--fingerprint-*` switches at launch. In the browser,
`FingerprintManager::LoadFromCommandLine` reads it **once**; every Blink surface
reads `base::CommandLine::ForCurrentProcess()`.

**Propagation = the command line is inherited by all child processes** (each
renderer, every worker process, the GPU process). That gives process‑wide
consistency for free — the single biggest reason to keep spoofs at the switch
level rather than per‑context JS.

**Updates are immutable per launch.** Do **not** mutate fingerprint values at
runtime — that is the source of staleness and cross‑process races. To change a
profile, **regenerate → relaunch** with the new command line. (If a live update
is ever unavoidable — e.g. proxy/timezone mid‑session — broadcast a single
versioned Mojo message to all renderers + GPU process; renderers reject stale
versions. Prefer relaunch.)

**Prevent stale values.** Embed `model_hash` in the launch command line; log it
at startup. The UI tracks the expected hash; on profile edit → new hash →
"restart to apply" gate. A UI↔browser hash mismatch surfaces a warning. On an
identity change, clear identity‑derived persisted state (SW caches that captured
old CH, cached UA in storage) so nothing survives the regeneration.

**Process‑wide consistency.** One source (command line), no per‑process
re‑derivation, no caching that can drift. For "use real" values, ensure all
contexts take the same host‑read path. The GPU process renders with the **real**
GPU — therefore the architecture must **disallow cross‑OS GPU spoofing**
(same‑OS ⇒ real GPU), which is already the project rule and the only way real
pixels stay coherent with the claimed renderer.

---

## 6. Verification checklist

**Internal consistency**
- [ ] Every exposed value traces to the canonical model (no surface reads host unless model says "real").
- [ ] All invariant edges (§1.#1–#11) hold.
- [ ] window == worker == iframe == service‑worker == GPU‑process for every value.
- [ ] `validate()` → 0 HARD violations.

**Reproducibility**
- [ ] `(model, seed, generator_version)` → byte‑identical profile (replay diff clean).
- [ ] No non‑determinism in generation (`Date.now`/`random`‑free).
- [ ] Golden profiles stable across engine rebuilds.

**Browser correctness**
- [ ] Spoofed properties native: on prototype, `[native code]` getter, native flags.
- [ ] Function‑identity/toString integrity suite passes.
- [ ] `window.chrome` present; `navigator.webdriver` false; no automation markers.
- [ ] Feature set matches claimed Chrome+platform (no over‑hardening anomaly).
- [ ] Real rendering works (WebGL/Canvas/Audio not broken by patches).

**Profile stability**
- [ ] Editing one axis regenerates only dependents (unrelated axes byte‑stable).
- [ ] Relaunch enforced after identity change; no stale values.
- [ ] `model_hash` logged at startup; UI↔browser hashes match.
```
