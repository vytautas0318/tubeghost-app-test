# Windows per-profile taskbar icons + window title

Goal (AdsPower-style): each launched profile shows its **profile number**
as its taskbar icon and in its window title, multiple profiles run at
once each with their own icon/identity, and TubeProxies branding is
preserved.

## Why this approach

On macOS we clone the engine `.app` and point `CFBundleIconFile` at a
per-profile icon (see `per-profile-app.ts` / `icon-badge.ts`). That can't
work on Windows: `chrome.exe` loads its sibling DLLs by relative path, so
it can't be relocated/duplicated per profile, and copying the whole
~300 MB Chromium tree per profile is a non-starter.

Two facts make a lighter approach work:

1. **Grouping is already correct.** Each profile launches its own
   `chrome.exe` with a distinct `--user-data-dir`, and Chromium derives
   its taskbar AppUserModelID from that dir — so Windows already shows a
   **separate** taskbar button per profile. The only thing missing is a
   distinct **icon** (they all inherit `chrome.exe`'s icon).
2. **A window's icon can be overridden at runtime** by sending
   `WM_SETICON` to its top-level HWND. The taskbar mirrors `ICON_BIG`.

So: generate a numbered `.ico` at runtime, then `WM_SETICON` it onto the
profile's Chromium window(s).

## Pieces

| Concern | File | Notes |
|---|---|---|
| 1. Dynamic icon generation | `src/main/engine/win-icon-generator.ts` | Composites the number pill over `resources/brand/icon.png` on a hidden `<canvas>`, encodes a multi-size PNG `.ico`. No native image lib. Cached at `<userData>/win-icons/profile-<n>.ico`. |
| 2. Window title | chromium patch (below) + `flag-builder.ts` | `--tp-window-title-prefix=Profile N · ` is already emitted; the engine patch consumes it. |
| 3. Taskbar icon replacement | `src/main/engine/win-taskbar-icon.ts` | koffi → `user32.dll`. Finds `Chrome_WidgetWin_1` windows owned by the launch PID, sends `WM_SETICON` (BIG+SMALL). Polls 15 s so it catches the window once it appears and any extra windows opened early. |
| 4. Cleanup | `win-taskbar-icon.ts` `releaseProfileTaskbarIcon` | Called from `session-manager.ts` on `child.exit` — stops the poll timer and `DestroyIcon`s the HICONs. |
| 5. Fallback | everywhere | Every step is wrapped + logged; any failure (no koffi, no window, generation error) just leaves the default Chromium icon. Launch never fails because of icon work. |

Wiring is in `session-manager.ts`, right after the session is registered,
gated on `process.platform === 'win32' && profile.profile_number != null`
(the badge *is* the number — nothing to draw without one).

## Dependencies / packaging

- `koffi` (prebuilt FFI, no node-gyp) is a runtime dependency.
- `electron-builder.yml` unpacks `node_modules/koffi/**` from the asar
  (its `.node` is loaded from disk) and ships `resources/brand/icon.png`
  to `process.resourcesPath/brand/`.

## Window title patch (engine side)

Chromium resets the OS window title to the page title on every
navigation, so the prefix must live in the engine. Add this to the
`ungoogled-chromium-windows` patch series (the launcher already passes
`--tp-window-title-prefix`).

Hook `BrowserView::GetWindowTitle()` — the single function that returns
the string the OS frame/taskbar displays:

```cpp
// chrome/browser/ui/views/frame/browser_view.cc
std::u16string BrowserView::GetWindowTitle() const {
  std::u16string title =
      browser_->GetWindowTitleForCurrentTab(/*include_app_name=*/true);

  // --- TubeProxies: per-profile window-title prefix ---
  // Read the switch as NATIVE (UTF-16 on Windows) so a non-ASCII
  // separator like "·" survives; GetSwitchValueASCII would mangle it.
  const base::CommandLine* cmd = base::CommandLine::ForCurrentProcess();
  if (cmd->HasSwitch("tp-window-title-prefix")) {
    std::u16string prefix =
        base::WideToUTF16(cmd->GetSwitchValueNative("tp-window-title-prefix"));
    if (!prefix.empty())
      title = prefix + title;
  }
  // --- end TubeProxies ---

  return title;
}
```

Notes:
- No switch registration is needed — `CommandLine` exposes any passed
  switch; Chromium does not strip unknown ones.
- If you'd rather avoid the non-ASCII `·`, change the separator in
  `flag-builder.ts` (e.g. `Profile ${n} - `) and you can use
  `GetSwitchValueASCII` instead.
- macOS doesn't need this patch — there the per-profile title comes from
  the cloned bundle's `CFBundleName`.

## Verifying on Windows

1. `npm run build:win` (or `npm run dev` on Windows).
2. Launch two profiles with numbers, e.g. 1 and 103.
3. Expect two separate taskbar buttons, each showing its number badge;
   hover/Alt-Tab shows the larger badge; with the engine patch, each
   window title starts with `Profile 1 · ` / `Profile 103 · `.
4. Close one profile → its taskbar button disappears and the HICON is
   freed; the other is unaffected.

> Built and statically validated on macOS (`.ico` byte layout verified
> with a real multi-size icon; types + bundling check out). The live
> `WM_SETICON` path and canvas render must be confirmed on Windows.
