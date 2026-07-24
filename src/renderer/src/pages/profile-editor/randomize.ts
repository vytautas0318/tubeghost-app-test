// Random fingerprint generator.
//
// Architecture: every entry below is one *real* shipping device with
// every spec locked together — CPU cores, RAM, GPU vendor, exact
// WebGL renderer, native screen resolution, OS version. Picking a
// device copies its whole row; we never independently roll CPU vs.
// RAM vs. GPU. That's how we avoid impossible combinations like
// "Mac M3 Max + 8 GB RAM" or "ThinkPad with NVIDIA RTX in a 4-core
// laptop".
//
// Catalog seeded with current-generation laptops + a few desktops
// that match what real consumers / creators actually use. Easy to
// extend — just add another entry, the picker handles the rest.
//
// brand_version + user_agent are templates: we substitute the
// concrete Chromium major at random-time so the UA always matches
// whatever browser version is selected.

import { DEVICES, WIN_UA, MAC_UA, LIN_UA } from './devices-catalog'
import { WEBGL_RENDERERS_BY_VENDOR } from './gpu-options'
import type { WebGLVendor } from './gpu-options'

// Re-export the catalogs so '@/pages/profile-editor/randomize' stays the stable
// import path for the editor (FingerprintCard, rules, ua).
export { WEBGL_RENDERERS_BY_VENDOR }
export { WEBGL_VENDORS, VENDORS_BY_PLATFORM } from './gpu-options'
export type { WebGLVendor } from './gpu-options'
export type { DevicePreset } from './devices-catalog'


// Build a UA for a platform + version pair. Used by the editor to
// regenerate user_agent when the user switches platform — without this,
// a Mac UA can survive a switch to Windows and the resulting
// platform/UA mismatch trips every fingerprint detector.
export function userAgentFor(platform: string, brandVersionMajor: string): string {
  const tmpl = platform === 'macos' ? MAC_UA : platform === 'linux' ? LIN_UA : WIN_UA
  return tmpl.replace('__V__', `${brandVersionMajor}.0.0.0`)
}

// True if the OS substring of `ua` agrees with the given platform.
// Used by the editor to skip regenerating the UA when the user already
// typed something coherent.
export function uaMatchesPlatform(ua: string, platform: string): boolean {
  if (platform === 'windows') return /Windows NT/.test(ua)
  if (platform === 'macos') return /Macintosh/.test(ua)
  if (platform === 'linux') return /X11; Linux/.test(ua) && !/Android/.test(ua)
  return true
}

// Browser versions available for launch *per spoofed platform*. Must
// stay in sync with what src/main/engine/versions.ts actually pins AND
// with which engine binaries are actually bundled in browsers/<arch>/ —
// we never offer a version we can't launch. Both 150 (current) and 148
// (previous) engines are bundled so users can A/B test across majors.
// The FIRST entry is the default for new profiles.
export const BROWSER_VERSIONS_BY_PLATFORM: Record<string, readonly string[]> = {
  windows: ['150', '148'],
  macos: ['150', '148'],
  linux: ['150', '148']
}

export function browserVersionsFor(platform: string): readonly string[] {
  return BROWSER_VERSIONS_BY_PLATFORM[platform] ?? ['150', '148']
}

// OS-version options per platform for the Fingerprint "OS version" picker. The
// value is stored in profiles.platform_version → Sec-CH-UA-Platform-Version
// (Windows 11 = 15.0.0, Windows 10 = 10.0.0, …). Empty ('All …') lets the
// engine keep/auto-derive it. Linux distros carry no client-hint version, so
// their values are distro tags (best-effort; the engine may treat Linux as
// version-less).
export type OsVersionOption = { value: string; label: string }
const OS_VERSIONS_BY_PLATFORM: Record<string, OsVersionOption[]> = {
  windows: [
    { value: '', label: 'All Windows' },
    { value: '15.0.0', label: 'Windows 11' },
    { value: '10.0.0', label: 'Windows 10' },
    { value: '6.2.0', label: 'Windows 8' },
    { value: '6.1.0', label: 'Windows 7' }
  ],
  macos: [
    { value: '', label: 'All macOS' },
    { value: '26.0.0', label: 'macOS 26' },
    { value: '15.0.0', label: 'macOS 15' },
    { value: '14.0.0', label: 'macOS 14' },
    { value: '13.0.0', label: 'macOS 13' },
    { value: '12.0.0', label: 'macOS 12' },
    { value: '11.0.0', label: 'macOS 11' },
    { value: '10.15.7', label: 'macOS 10' }
  ],
  linux: [
    { value: '', label: 'All Linux' },
    { value: 'ubuntu', label: 'Ubuntu' },
    { value: 'fedora', label: 'Fedora' },
    { value: 'debian', label: 'Debian' }
  ]
}
export function osVersionsFor(platform: string): OsVersionOption[] {
  return OS_VERSIONS_BY_PLATFORM[platform] ?? OS_VERSIONS_BY_PLATFORM.windows
}

export function randomRendererFor(vendor: WebGLVendor): string {
  const list = WEBGL_RENDERERS_BY_VENDOR[vendor]
  return list[Math.floor(Math.random() * list.length)]
}

// Plausible device-owner names for the Device Name field. Cosmetic
// only (browsers don't expose hostname to JS) — but matches AdsPower's
// "Akeem's MacBook Pro" default so users see something sensible.
const FIRST_NAMES = [
  'Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Jamie', 'Riley',
  'Avery', 'Quinn', 'Cameron', 'Drew', 'Reese', 'Skyler', 'Devon', 'Parker'
]
const DEVICE_KINDS_BY_PLATFORM: Record<string, readonly string[]> = {
  windows: ['Desktop', 'PC', 'Laptop', 'ThinkPad', 'XPS', 'Surface'],
  macos: ['MacBook Pro', 'MacBook Air', 'iMac', 'Mac mini', 'Mac Studio'],
  linux: ['Laptop', 'Workstation', 'Desktop', 'ThinkPad']
}

export function randomDeviceName(platform: string): string {
  const first = pick(FIRST_NAMES)
  const kind = pick(DEVICE_KINDS_BY_PLATFORM[platform] ?? DEVICE_KINDS_BY_PLATFORM.windows)
  return `${first}'s ${kind}`
}

// Random MAC address. We generate a locally-administered unicast
// address (second-least-significant bit of the first byte = 1) so it
// won't collide with a real OUI-assigned one even by chance.
export function randomMacAddress(): string {
  const bytes: string[] = []
  for (let i = 0; i < 6; i++) {
    let b = Math.floor(Math.random() * 256)
    if (i === 0) b = (b & 0xfe) | 0x02 // unicast + locally administered
    bytes.push(b.toString(16).padStart(2, '0'))
  }
  return bytes.join(':')
}

// Resolution is now intrinsic to each device archetype above —
// MacBooks get retina, ThinkPads get 1366×768, etc. We never pick
// resolution independently of the device anymore.
const LANGUAGES = ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR']
const TIMEZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Asia/Tokyo'
]

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
const seed = (): number => Math.floor(Math.random() * 2_147_483_647)

export interface RandomFingerprint {
  fingerprint_seed: number
  platform: string
  platform_version: string
  brand: string
  brand_version: string
  user_agent: string
  webgl_vendor: string
  webgl_renderer: string
  hardware_concurrency: number
  device_memory: number
  language: string
  timezone: string
  screen_resolution: string
  noise_canvas: boolean
  noise_webgl_image: boolean
  noise_audiocontext: boolean
  noise_media_device: boolean
  noise_clientrects: boolean
  noise_speechvoices: boolean
}

export function generateRandomFingerprint(opts?: {
  // Constrain to a specific spoofed OS. Used by the editor's "New
  // fingerprint" button so it keeps whatever platform the user chose.
  platform?: string
  // Constrain to a specific Chromium major version (so "New
  // fingerprint" doesn't silently bump the user's chosen browser).
  // Falls back to the first available version for the picked
  // device's platform.
  brand_version_major?: string
}): RandomFingerprint {
  const pool = opts?.platform
    ? DEVICES.filter((d) => d.platform === opts.platform)
    : DEVICES
  const device = pick(pool.length > 0 ? pool : DEVICES)
  const major =
    opts?.brand_version_major ?? browserVersionsFor(device.platform)[0] ?? '150'
  // Real Chrome reports the full quad version. We lock the upstream
  // patch to .0.0.0 so all profiles in a workspace look identical
  // for that field — sites can't fingerprint by exact patch.
  const brand_version = `${major}.0.0.0`
  return {
    fingerprint_seed: seed(),
    platform: device.platform,
    platform_version: device.platform_version,
    brand: device.brand,
    brand_version,
    user_agent: device.user_agent_tmpl.replace('__V__', brand_version),
    webgl_vendor: device.webgl_vendor,
    webgl_renderer: device.webgl_renderer,
    hardware_concurrency: device.hardware_concurrency,
    device_memory: device.device_memory,
    language: pick(LANGUAGES),
    timezone: pick(TIMEZONES),
    screen_resolution: device.screen_resolution,
    // ALL hardware-noise surfaces ON. The randomness + per-profile uniqueness
    // comes from the seed (above): each profile's seed drives a distinct noise
    // pattern, so two profiles on the same machine never share an identical
    // canvas/audio/WebGL/clientRects hash, while the SAME profile reproduces the
    // same hash every launch (seed is fixed + persisted). NOTE: seed-driven
    // noise on these surfaces can read as masking on pixelscan/CreepJS — the
    // inherent cost of noise-based decorrelation, applied to every new profile.
    noise_canvas: true,
    noise_webgl_image: true,
    noise_audiocontext: true,
    noise_media_device: true,
    noise_clientrects: true,
    noise_speechvoices: true
  }
}
