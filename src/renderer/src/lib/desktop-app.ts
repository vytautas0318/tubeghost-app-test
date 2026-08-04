// The web/desktop seam.
//
// Launching a browser profile runs the anti-detect engine (fingerprint-chromium
// + gost) on the user's own machine, so it can only ever happen in the desktop
// app. This web build therefore shows the Open button — hiding it just makes
// users think the feature is missing — and explains the requirement when it's
// clicked. Same pattern AdsPower uses on their web dashboard.

export const DOWNLOAD_URL = 'https://tubeghost.com/download'

// True when running inside the Electron shell, which exposes a preload bridge
// on `window`. Always false in this web build; kept as the single place to ask
// the question so a future shared build only has to wire the launch call here.
export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && 'tubeghost' in window
}

// Best-effort OS label for the download CTA ("Download for macOS"). Falls back
// to a neutral label when the platform can't be read.
export function desktopPlatformLabel(): string {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'desktop'
}
