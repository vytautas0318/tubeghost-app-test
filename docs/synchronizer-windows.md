# Synchronizer — Windows tab & Master highlight (capabilities + fork gaps)

Investigation results for Parts D & E of the AdsPower-parity work, and the exact
browser-fork changes still required. **Nothing here is faked with launch-only
flags** — feasible actions are wired against real runtime CDP; the gaps are
documented, not stubbed.

## Part D — runtime OS-window control: WORKS TODAY, no fork change

The patched Chromium fork compiles in the stock CDP **Browser** window commands
and they are reachable over the existing `--remote-debugging-pipe` FD channel
(the same trusted local pipe the app already uses for `Browser.close`):

- `Browser.getWindowForTarget` → `browser_handler.cc:87`
- `Browser.getWindowBounds` → `browser_handler.cc:123`
- `Browser.setWindowBounds` → `browser_handler.cc:139` (calls real
  `window->SetBounds()` / `Maximize()` / `Minimize()` / `Restore()` /
  `EnterFullscreen()`)

Wired at `chrome_devtools_session.cc:121`, gated by `IsTrusted()`; a local FD-pipe
client is trusted, so the guard passes. Verified compiled (object files present,
no ungoogled/fingerprint patch touches them).

**Implemented in the app (`CdpPipe`):** `getWindowId(sessionId)`,
`getWindowBounds(windowId)`, `setWindowBounds(windowId, bounds)`. The engine
(`src/main/synchronizer/windows.ts`) computes bounds against a display from
`screen.getAllDisplays()` and applies them per participant.

Wired Windows-tab actions (all real, exact behavior):
- **Uniform size** — resize every window to W×H.
- **Grid / Tile** — non-overlapping grid over the display work area.
- **Overlapped** — cascade offset.
- **Window layout / monitor selector** — choose the display; bounds computed in
  its `workArea`.

### The one gap in Part D: pure raise/focus without restore
CDP has **no** raw "raise window / focus" command, and the fork adds none.
**View windows** is therefore approximated as `setWindowBounds` `minimized →
normal` (a `Restore()` raises the window on both platforms). This is a real,
working raise, but it flickers through a minimize.

**Fork change for true focus-without-restore** (optional, future):
add a `Browser.bringToFront`-style handler (or extend `setWindowBounds` with a
`raise:true` flag) in `browser_handler.cc` calling `window->Activate()` /
`Show()` without the min→restore cycle. App-side hook: a new
`CdpPipe.raiseWindow(windowId)` would replace the min→restore in
`windows.ts consoleWindows('viewWindows')`.

## Part E — master-window highlight: needs a fork change for a NATIVE border

There is **no** existing mechanism to tint/border the browser **chrome** (grep
across all fork patches for border/frame/accent/tint = empty; no flag, no CDP
command). Per-profile identity today is text/icon only (window-title profile
number, per-profile dock tile).

**What ships now (runtime, works today):** a CDP-injected in-page inset border
overlay on the master's tabs (`CdpPipe.setHighlight(color)` →
`highlightSource()`), installed per-document so it survives navigation, applied
to every master tab, moved on master reassignment
(`src/main/synchronizer/highlight.ts`). It is **OFF by default** and opt-in.

**Limitations (why it's not the final form):**
- Covers the **page viewport**, not the browser chrome (title bar / tab strip).
- Adds a DOM element to every master page → a small page-realism cost on an
  anti-detect browser. Hence opt-in + off by default.

**Fork change for a native chrome border (the correct long-term mechanism):**
follow the fork's switch convention (like `--fingerprint-*`):
1. Add `--sync-highlight-color=<css-color>` to `components/ungoogled/
   ungoogled_switches.{cc,h}` (same file the fingerprint switches live in).
2. Read it where the browser frame/`BrowserView` is constructed and paint a
   border/accent on the native frame (this is the real C++ work — no existing
   precedent in the patches, which are all switch+startup-manager, not frame
   drawing).
3. Because a switch is **launch-only**, live reassignment would need either a
   relaunch of the newly-designated master or a new tiny CDP command
   (`Browser.setHighlightColor`) to update it at runtime.

**App-side hook already in place:** `SyncSettings.masterHighlight { enabled,
color }` + `CdpPipe.setHighlight`. Swapping the overlay for a native mechanism is
a drop-in replacement of `setHighlight`'s body; the engine/UI don't change.

## No CDP `Input.*` was added anywhere for this work; the `InputReplayer` seam is
preserved for future trusted input.
