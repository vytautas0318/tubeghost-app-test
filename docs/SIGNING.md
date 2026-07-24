# macOS code signing + notarization

The default `npm run build:mac` produces an **adhoc-signed** (unsigned)
DMG. It runs, but Gatekeeper flags it on first launch — users must
right-click → Open, or run
`xattr -dr com.apple.quarantine "/Applications/TubeProxies Browser.app"`.

To ship a DMG that opens with no warning, the app must be **Developer ID
signed + notarized** by Apple. That requires credentials Apple only
issues to a paid account — they are NOT in this repo and cannot be
generated locally.

## What you need (one-time)

1. **Apple Developer Program membership** — $99/yr
   (https://developer.apple.com/programs/).
2. A **"Developer ID Application"** certificate, installed in your login
   keychain. Create it in Xcode (Settings → Accounts → Manage
   Certificates → + → Developer ID Application) or on the Apple Developer
   site, then double-click the `.cer` to import.
   - Verify: `security find-identity -v -p codesigning` should list a
     `Developer ID Application: <Your Name> (TEAMID)` entry.
3. **Notarization credentials**, one of:
   - **Apple ID + app-specific password**: create the app-specific
     password at https://appleid.apple.com → Sign-In and Security →
     App-Specific Passwords. You also need your 10-char Team ID.
   - **App Store Connect API key** (preferred for CI): a `.p8` key with
     Developer access.

## Building a signed + notarized DMG

Set the env vars, then run the signed build script (added to
`package.json`):

```bash
# Apple ID + app-specific password variant:
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="XXXXXXXXXX"

npm run build:mac:signed
```

…or with an API key:

```bash
export APPLE_API_KEY="/absolute/path/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

npm run build:mac:signed
```

`build:mac:signed` differs from `build:mac` only in the flags it passes:
`hardenedRuntime=true` (required for notarization),
`gatekeeperAssess=false`, the entitlements file, and `notarize=true`.
electron-builder auto-selects the Developer ID cert from your keychain
(or `CSC_LINK`/`CSC_KEY_PASSWORD` if you point it at a `.p12`).

Notarization uploads the app to Apple and waits for a ticket
(~2–15 min); electron-builder staples it to the DMG automatically.

## Verifying the result

```bash
# Signature is Developer ID, not adhoc:
codesign -dv --verbose=2 "dist/mac/TubeProxies Browser.app"
# Gatekeeper accepts it:
spctl -a -vvv -t install "dist/mac/TubeProxies Browser.app"
# Notarization ticket is stapled:
xcrun stapler validate "dist/tubeproxies-browser-0.1.1.dmg"
```

## Note on the bundled engine

The fingerprint-chromium engine bundled at
`Resources/engine/TubeProxies Browser.app` is its own nested app. When
notarizing the outer app, the hardened-runtime sign step signs nested
code too. The engine ships adhoc today; if notarization rejects the
nested bundle, re-sign it with the Developer ID cert and
`--options runtime` before packaging, or add it to electron-builder's
`signIgnore` and notarize it separately.
