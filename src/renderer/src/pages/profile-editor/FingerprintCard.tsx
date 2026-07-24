// AdsPower-style fingerprint editor. Sectioned layout, segmented
// controls + toggles, with a "New fingerprint" button at the top
// that randomizes every dimension at once. Live changes also flow
// into the Overview sidebar via the form state in the parent.

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { Section } from './parts'
import { NavIcon } from '@/components/sidebar/navIcons'
import { Row, Seg } from './seg'
import { useDirtyGuard, useRegisterSaver, type SaveResult } from './DirtyContext'

import {
  WEBGL_RENDERERS_BY_VENDOR,
  WEBGL_VENDORS,
  VENDORS_BY_PLATFORM,
  browserVersionsFor,
  osVersionsFor,
  generateRandomFingerprint,
  randomDeviceName,
  randomMacAddress,
  uaMatchesPlatform,
  userAgentFor,
  type WebGLVendor
} from './randomize'
import { TIMEZONE_OPTIONS } from './timezones'
import {
  OPTIMIZED_PRESET,
  OPTIMIZED_CONTROLLED_FIELDS,
  matchesOptimized
} from './optimizedPreset'
import { updateProfile, type ProfileRow } from '@/lib/profiles'

const inputCls =
  'w-full px-2.5 py-1.5 text-xs bg-[var(--panel-2)] border border-[var(--line)] rounded-md text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30'

// Compact switch + label for the Hardware-noise row (one per fingerprint
// surface). Mirrors the settings ToggleRow switch styling but laid out inline,
// three per row, to match the editor's dense fingerprint grid.
function NoiseToggle({
  label,
  checked,
  onChange,
  title
}: {
  label: string
  checked: boolean
  onChange: () => void
  title?: string
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      title={title}
      className="flex items-center gap-2 text-left"
    >
      <span
        className={
          checked
            ? 'relative inline-flex h-5 w-9 shrink-0 rounded-full bg-[var(--red)] transition-colors'
            : 'relative inline-flex h-5 w-9 shrink-0 rounded-full bg-[var(--hover)] border border-[var(--line)] transition-colors'
        }
      >
        <span
          className={
            checked
              ? 'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform translate-x-[18px] mt-[1px]'
              : 'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform translate-x-[2px] mt-[1px]'
          }
        />
      </span>
      <span className="text-xs text-[var(--t1)]">{label}</span>
    </button>
  )
}

// Common monitor resolutions for the Screen-resolution picker (incl. Apple
// "looks-like" scaled resolutions like 1470x956 … 2880x1800 that a Retina
// MacBook reports). Arranged by SIZE — ascending width, then height — so the
// dropdown reads small → large. Add new entries anywhere; they auto-sort.
const RES_OPTIONS = [
  '1920x1080',
  '1366x768',
  '1536x864',
  '1280x720',
  '1600x900',
  '1360x768',
  '2560x1440',
  '3840x2160',
  '1280x1024',
  '1440x900',
  '1280x800',
  '1680x1050',
  '1920x1200',
  '2560x1600',
  '3840x2400',
  '1470x956',
  '1512x982',
  '1728x1117',
  '2240x1260',
  '2880x1800'
].sort((a, b) => {
  const [aw, ah] = a.split('x').map(Number)
  const [bw, bh] = b.split('x').map(Number)
  return aw - bw || ah - bh
})

// Custom-mode dropdown options for CPU cores and RAM (mirrors AdsPower).
const CPU_CORE_OPTIONS = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 64]
const RAM_GB_OPTIONS = [2, 4, 6, 8, 16, 32, 64, 128]

// Ensure the current value is selectable even if it's not a standard option
// (e.g. an archetype's 14 cores), so the dropdown never shows blank.
function withCurrent(opts: number[], cur: number | ''): number[] {
  const n = Number(cur)
  return Number.isFinite(n) && n > 0 && !opts.includes(n)
    ? [...opts, n].sort((a, b) => a - b)
    : opts
}

type Mode3 = 'real' | 'based_on_ip' | 'custom'
type WebRtcMode = 'forward' | 'replace' | 'real' | 'disabled' | 'proxy_udp'
type WebGpuMode = 'based_on_webgl' | 'real' | 'disabled'

// Pull a major-version string ("148") out of the stored full version.
function majorVersion(v: string | null | undefined, platform = 'windows'): string {
  const fallback = browserVersionsFor(platform)[0] ?? '150'
  if (!v) return fallback
  const m = v.match(/^(\d+)/)
  return m ? m[1] : fallback
}

interface Form {
  // identity
  fingerprint_seed: number
  platform: string
  brand: string
  brand_version_major: string
  // OS version → platform_version (Sec-CH-UA-Platform-Version); '' = All/auto.
  platform_version: string
  user_agent: string
  // hardware — Real (use this machine's value, persisted null) / Custom (spoof).
  cpu_mode: 'real' | 'custom'
  ram_mode: 'real' | 'custom'
  hardware_concurrency: number | ''
  device_memory: number | ''
  // 'real' → report the host's actual GPU (no override sent to the
  // engine; persisted as null vendor/renderer). 'custom' → spoof the
  // vendor/renderer strings below. Derived on load from whether the row
  // carries a stored vendor/renderer.
  webgl_mode: 'real' | 'custom'
  webgl_vendor: WebGLVendor
  webgl_renderer: string
  webgpu_mode: WebGpuMode
  screen_resolution: string
  // localization
  timezone_mode: Mode3
  timezone: string
  language_mode: Mode3
  language: string
  display_language_mode: 'real' | 'based_on_language' | 'custom'
  display_language: string
  // location (browser geolocation API)
  location_mode: 'real' | 'based_on_ip' | 'custom' | 'block'
  location_lat: number | ''
  location_lon: number | ''
  location_prompt: 'ask' | 'always_allow'
  // privacy
  webrtc_mode: WebRtcMode
  // noise
  noise_canvas: boolean
  noise_webgl_image: boolean
  noise_audiocontext: boolean
  noise_media_device: boolean
  noise_clientrects: boolean
  noise_speechvoices: boolean
  // hardware extras
  fonts_mode: 'default' | 'custom'
  fonts_list_text: string  // newline-separated, joined to text[] on save
  device_name: string
  mac_address: string
  // network privacy
  port_scan_protection: boolean
  allowed_ports: string
  // resolution mode (custom mode reveals width × height inputs)
  resolution_mode: 'predefined' | 'custom'
  resolution_w: number | ''
  resolution_h: number | ''
}

function defaultVendorFor(platform: string): WebGLVendor {
  if (platform === 'macos') return 'Google Inc. (Apple)'
  // Linux + Windows both default to Intel — most common discrete-less
  // device fingerprint and works as a safe fallback.
  return 'Google Inc. (Intel)'
}

function rowToForm(p: ProfileRow): Form {
  const platform = p.platform ?? 'windows'
  const vendor = (WEBGL_VENDORS as readonly string[]).includes(p.webgl_vendor ?? '')
    ? (p.webgl_vendor as WebGLVendor)
    : defaultVendorFor(platform)
  // If no renderer is stored yet, give the user a sensible default
  // for their vendor so the field is never blank.
  const renderer =
    p.webgl_renderer ||
    WEBGL_RENDERERS_BY_VENDOR[vendor][0] ||
    ''
  return {
    fingerprint_seed: p.fingerprint_seed,
    platform,
    brand: p.brand ?? 'Chrome',
    brand_version_major: majorVersion(p.brand_version),
    platform_version: p.platform_version ?? '',
    user_agent: p.user_agent ?? '',
    // Real when the row stores no value (use the host's real cores/RAM), Custom
    // when a value was explicitly saved. Keep a sensible value staged for the
    // dropdown when in Real mode so switching to Custom shows a coherent default.
    cpu_mode: p.hardware_concurrency != null ? 'custom' : 'real',
    ram_mode: p.device_memory != null ? 'custom' : 'real',
    hardware_concurrency: p.hardware_concurrency ?? 8,
    device_memory: p.device_memory ?? 8,
    // 'real' (recommended) when the row stores no GPU override — the
    // engine then reports the host's actual GPU and every GPU surface
    // (WebGL params, extensions, WebGPU adapter, ANGLE backend) agrees.
    // 'custom' only when a vendor/renderer was explicitly saved.
    webgl_mode: p.webgl_vendor ? 'custom' : 'real',
    webgl_vendor: vendor,
    webgl_renderer: renderer,
    webgpu_mode: (p.webgpu_mode as WebGpuMode) ?? 'based_on_webgl',
    screen_resolution: p.screen_resolution ?? '1920x1080',
    // Default to Based-on-IP when missing — never default to "Real",
    // which would leak the user's real OS timezone / language.
    timezone_mode: (p.timezone_mode as Mode3) ?? 'based_on_ip',
    timezone: p.timezone ?? 'America/New_York',
    language_mode: (p.language_mode as Mode3) ?? 'based_on_ip',
    language: p.language ?? 'en-US',
    // Default to Based-on-IP when missing — never default to "Real"
    // since that leaks the user's real GPS coordinates.
    location_mode: (p.location_mode as 'real' | 'based_on_ip' | 'custom' | 'block') ?? 'based_on_ip',
    location_lat: p.location_lat ?? '',
    location_lon: p.location_lon ?? '',
    location_prompt: (p.location_prompt as 'ask' | 'always_allow') ?? 'ask',
    webrtc_mode: (p.webrtc_mode as WebRtcMode) ?? 'forward',
    // Hardware noise defaults OFF (Real output = pixelscan-safe); opt in per surface.
    noise_canvas: p.noise_canvas ?? false,
    noise_webgl_image: p.noise_webgl_image ?? false,
    noise_audiocontext: p.noise_audiocontext ?? false,
    noise_media_device: p.noise_media_device ?? false,
    noise_clientrects: p.noise_clientrects ?? false,
    noise_speechvoices: p.noise_speechvoices ?? true,
    display_language_mode:
      (p.display_language_mode as 'real' | 'based_on_language' | 'custom') ?? 'based_on_language',
    display_language: p.display_language ?? '',
    fonts_mode: (p.fonts_mode as 'default' | 'custom') ?? 'default',
    fonts_list_text: (p.fonts_list ?? []).join('\n'),
    device_name: p.device_name ?? '',
    mac_address: p.mac_address ?? '',
    port_scan_protection: p.port_scan_protection ?? false,
    allowed_ports: p.allowed_ports ?? '',
    resolution_mode:
      p.screen_resolution && /^\d+x\d+$/.test(p.screen_resolution)
        && !RES_OPTIONS.includes(p.screen_resolution)
          ? 'custom'
          : 'predefined',
    resolution_w:
      p.screen_resolution && /^\d+x\d+$/.test(p.screen_resolution)
        ? Number(p.screen_resolution.split('x')[0])
        : '',
    resolution_h:
      p.screen_resolution && /^\d+x\d+$/.test(p.screen_resolution)
        ? Number(p.screen_resolution.split('x')[1])
        : ''
  }
}

export function FingerprintCard({
  profile,
  onSaved,
  onFormChange
}: {
  profile: ProfileRow
  onSaved?: (p: ProfileRow) => void
  onFormChange?: (f: Form) => void
}): React.ReactElement {
  const [form, setForm] = useState<Form>(() => rowToForm(profile))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Persisted "show advanced" preference. Defaults to off so the
  // form looks light for non-technical users; power users toggle
  // once and the choice sticks across visits via localStorage.
  const [showAdvanced, setShowAdvanced] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tpb.fp.showAdvanced') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('tpb.fp.showAdvanced', showAdvanced ? '1' : '0')
    } catch { /* ignore */ }
  }, [showAdvanced])

  useEffect(() => setForm(rowToForm(profile)), [profile])
  useEffect(() => onFormChange?.(form), [form, onFormChange])

  // Heal a stale stored Chromium major on OPEN. A profile saved before an
  // engine upgrade keeps its old brand_version_major (e.g. "148") which is no
  // longer in browserVersionsFor() — the dropdown, Overview panel and any saved
  // UA string would all still show the old version. Bump it to the shipped
  // major and rewrite the Chrome/<v> token in a saved UA to match, so opening
  // the editor after an upgrade shows the current version without a manual edit.
  // Runs once on mount (not on every platform switch — that path is handled by
  // the effect below).
  useEffect(() => {
    const allowed = browserVersionsFor(form.platform)
    if (allowed.includes(form.brand_version_major)) return
    const v = allowed[0] ?? '150'
    const patch: Partial<Form> = { brand_version_major: v }
    if (form.user_agent) {
      patch.user_agent = form.user_agent.replace(/Chrome\/\d+\.[\d.]+/, `Chrome/${v}.0.0.0`)
    }
    setForm((f) => ({ ...f, ...patch }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-correct platform-dependent fields when the user switches OS
  // so we never hold an incoherent state (e.g. "macOS + NVIDIA GPU"
  // or a Chromium major that only ships for one platform upstream).
  // Also regenerates user_agent if the saved string is for the wrong
  // OS — without this, a Mac UA survives a switch to Windows and
  // navigator.platform vs navigator.userAgent disagree, which every
  // fingerprint detector catches as a lie.
  useEffect(() => {
    const allowedVendors = VENDORS_BY_PLATFORM[form.platform] ?? WEBGL_VENDORS
    const allowedVersions = browserVersionsFor(form.platform)
    const patch: Partial<Form> = {}
    if (!allowedVendors.includes(form.webgl_vendor)) {
      const v = allowedVendors[0]
      patch.webgl_vendor = v
      patch.webgl_renderer = WEBGL_RENDERERS_BY_VENDOR[v][0]
    }
    if (!allowedVersions.includes(form.brand_version_major)) {
      patch.brand_version_major = allowedVersions[0] ?? '150'
    }
    // Reset OS version to "All" when switching to a platform where the current
    // selection isn't a valid option (e.g. "Windows 11" → macOS).
    if (!osVersionsFor(form.platform).some((o) => o.value === form.platform_version)) {
      patch.platform_version = ''
    }
    // UA coherence — only regenerate when the user has actually saved
    // a UA (so we don't fight the "Auto-derived if blank" placeholder).
    // Use the patched brand_version if we just changed it, else the
    // current one — keeps the UA consistent with the (possibly newly
    // bumped) Chrome version too.
    if (form.user_agent && !uaMatchesPlatform(form.user_agent, form.platform)) {
      const v = patch.brand_version_major ?? form.brand_version_major
      patch.user_agent = userAgentFor(form.platform, v)
    }
    if (Object.keys(patch).length > 0) setForm({ ...form, ...patch })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.platform])

  const dirty = JSON.stringify(form) !== JSON.stringify(rowToForm(profile))
  useDirtyGuard('Fingerprint', dirty)

  const update = (patch: Partial<Form>): void => setForm({ ...form, ...patch })

  // ── Google/YouTube Optimized preset ──────────────────────────────
  // The toggle is DERIVED, not independent state: it reads on/off from
  // whether the live form matches OPTIMIZED_PRESET (matchesOptimized). So
  // any manual edit to a preset-controlled field instantly flips it off —
  // the label can never lie about the profile.
  const optimizedOn = matchesOptimized(form)
  // Snapshot of the controlled fields taken the moment the user turns the
  // preset ON, so OFF restores exactly what they had (not the app default).
  const preOptimizeRef = useRef<Partial<Form> | null>(null)
  // Was the row saved as "optimized"? Used only to tell "user turned it off"
  // apart from "user edited a field" for the partial-state hint below.
  const savedOptimized = profile.google_optimized === true

  const setOptimized = (on: boolean): void => {
    if (on) {
      // Remember current controlled values for a clean restore.
      const snap: Partial<Form> = {}
      for (const k of OPTIMIZED_CONTROLLED_FIELDS) {
        ;(snap as Record<string, unknown>)[k] = form[k]
      }
      preOptimizeRef.current = snap
      // WebGL=Custom needs a coherent vendor/renderer. If the profile is on
      // Real (no spoof strings), seed the archetype's GPU so Custom is valid
      // and still hides the real device — same rule as "New fingerprint".
      const patch: Partial<Form> = { ...OPTIMIZED_PRESET }
      if (form.webgl_mode === 'real') {
        const r = generateRandomFingerprint({
          platform: form.platform,
          brand_version_major: form.brand_version_major
        })
        patch.webgl_vendor = r.webgl_vendor as WebGLVendor
        patch.webgl_renderer = r.webgl_renderer
      }
      update(patch)
    } else {
      // Restore the pre-optimize snapshot when we have one; otherwise fall
      // back to the app's safe non-real defaults (never strand on preset
      // values, and never revert to "Real" which would leak the device).
      const restore: Partial<Form> = preOptimizeRef.current ?? {
        webrtc_mode: 'forward',
        timezone_mode: 'based_on_ip',
        language_mode: 'based_on_ip',
        location_mode: 'based_on_ip',
        display_language_mode: 'based_on_language',
        webgl_mode: 'real',
        webgpu_mode: 'based_on_webgl'
      }
      preOptimizeRef.current = null
      update(restore)
    }
  }

  const onNewFingerprint = (): void => {
    // "New fingerprint" defaults the platform to macOS, then randomizes
    // everything else. Keep the user's browser version. Localization
    // defaults to "Based on IP" so the proxy's egress decides
    // timezone/language at launch instead of a random pick that could
    // mismatch the proxy.
    const platform = 'macos'
    const r = generateRandomFingerprint({
      platform,
      brand_version_major: form.brand_version_major
    })
    // "New fingerprint" must produce a safe, anti-detect-coherent
    // profile from any starting state — including legacy rows that
    // somehow carry `_mode: 'real'`. We force every mode field to its
    // safe non-real default rather than leaving stale values.
    update({
      fingerprint_seed: r.fingerprint_seed,
      platform: r.platform,
      // brand_version_major: unchanged
      brand: r.brand,
      user_agent: r.user_agent,
      // WebGL metadata defaults to CUSTOM (product decision) — every new profile
      // gets the archetype's coherent GPU for variety / to hide the real device.
      // NOTE: on a SAME-OS profile (a Mac profile on a Mac) the real GPU renders
      // the page, so a custom GPU is flagged as "masking" on pixelscan. To make a
      // specific profile pass masking, switch its WebGL metadata to Real.
      webgl_mode: 'custom',
      webgl_vendor: r.webgl_vendor as WebGLVendor,
      webgl_renderer: r.webgl_renderer,
      // CPU/RAM → Custom with the archetype's coherent values (matches the Custom
      // WebGL device). Switch a field to Real to use this machine's real value.
      cpu_mode: 'custom',
      ram_mode: 'custom',
      hardware_concurrency: r.hardware_concurrency,
      device_memory: r.device_memory,
      screen_resolution: r.screen_resolution,
      // Keep the resolution PICKER fields in sync with the new value. Previously
      // only screen_resolution updated, so a 'custom' picker kept showing the OLD
      // width/height and Save (which reads resolution_w/h in custom mode) reverted
      // to them — the friend's "it keeps going back to 4480x2520". Now New
      // fingerprint sets the mode + w/h too, so picker, Overview, and Save agree.
      resolution_mode: RES_OPTIONS.includes(r.screen_resolution) ? 'predefined' : 'custom',
      resolution_w: Number(r.screen_resolution.split('x')[0]) || '',
      resolution_h: Number(r.screen_resolution.split('x')[1]) || '',
      // Locale modes — proxy-aware
      timezone_mode: 'based_on_ip',
      language_mode: 'based_on_ip',
      display_language_mode: 'based_on_language',
      // Network privacy — never expose real
      webrtc_mode: 'forward',
      // Geolocation — never expose real GPS
      location_mode: 'based_on_ip',
      location_prompt: 'ask',
      // GPU — coherent with WebGL
      webgpu_mode: 'based_on_webgl',
      // Hardware noise — all on (per-profile seed → unique noise, consistent once saved)
      noise_canvas: r.noise_canvas,
      noise_webgl_image: r.noise_webgl_image,
      noise_audiocontext: r.noise_audiocontext,
      noise_media_device: r.noise_media_device,
      noise_clientrects: r.noise_clientrects,
      noise_speechvoices: r.noise_speechvoices,
      // Per-profile device identity — re-randomized so two
      // "New fingerprint" presses never collide.
      device_name: randomDeviceName(platform),
      mac_address: randomMacAddress(),
      // Network privacy
      port_scan_protection: true
    })
  }


  // Pre-save validation per launcher spec §7. Catches user mistakes
  // before they reach the launcher and ship a malformed flag. Returns
  // the first error message or null when the form is valid.
  const validateForm = (): string | null => {
    // Screen resolution: \d+x\d+, both > 0.
    const sr =
      form.resolution_mode === 'custom'
        ? form.resolution_w && form.resolution_h
          ? `${form.resolution_w}x${form.resolution_h}`
          : ''
        : form.screen_resolution
    if (sr && !/^\d+x\d+$/.test(sr)) {
      return 'Screen resolution must be in WxH format (e.g. 1920x1080).'
    }
    if (form.resolution_mode === 'custom') {
      const w = Number(form.resolution_w)
      const h = Number(form.resolution_h)
      if (!w || !h || w <= 0 || h <= 0) {
        return 'Custom resolution width and height must both be > 0.'
      }
    }
    // Hardware concurrency: 2..64. Spec narrows from the previous 1..64;
    // single-core machines are extinct in 2025 and an obvious bot tell.
    if (form.hardware_concurrency !== '') {
      const c = Number(form.hardware_concurrency)
      if (!Number.isInteger(c) || c < 2 || c > 64) {
        return 'CPU cores must be an integer between 2 and 64.'
      }
    }
    // GPU vendor + renderer pair — only enforced in Custom mode (Real
    // persists no override at all, so blank fields are expected there).
    if (form.webgl_mode === 'custom' && form.webgl_vendor && !form.webgl_renderer) {
      return 'WebGL renderer is required when WebGL metadata is Custom.'
    }
    // Brand + version pair. brand_version_major is always set (default
    // 148); brand also has a default. Both should be non-empty if either is.
    if (form.brand && !form.brand_version_major) {
      return 'Browser version is required when a brand is set.'
    }
    // Timezone IANA shape (basic check — full ICU validation runs in
    // the engine at launch). We just reject obvious garbage like
    // free-text "Europe/Lndon" with a typo or non-IANA strings.
    if (form.timezone_mode === 'custom' && form.timezone) {
      if (!/^[A-Za-z]+(?:\/[A-Za-z_-]+)+$/.test(form.timezone) && form.timezone !== 'UTC') {
        return 'Timezone must be an IANA zone like "America/New_York" or "UTC".'
      }
    }
    // Location bounds.
    if (form.location_mode === 'custom') {
      const lat = Number(form.location_lat)
      const lon = Number(form.location_lon)
      if (form.location_lat === '' || form.location_lon === '') {
        return 'Latitude and longitude are both required for Custom location.'
      }
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return 'Latitude must be -90..90 and longitude -180..180.'
      }
    }
    return null
  }

  // Pure persist — used by both the per-card Save button and the
  // editor's top-right Save (via useRegisterSaver). Does NOT call
  // onSaved/reload; the caller decides whether to trigger a refresh.
  // Returns the updated row on success so the local Save flow can
  // re-hydrate without an extra round-trip.
  const persist = async (): Promise<SaveResult & { row?: ProfileRow }> => {
    if (!dirty) return { ok: true }
    const err = validateForm()
    if (err) return { ok: false, error: err }
    try {
      const r = await updateProfile(profile.id, {
        fingerprint_seed: form.fingerprint_seed,
        platform: form.platform,
        brand: form.brand,
        // Persist the *full* version so existing data layer assumptions
        // hold; the editor only exposes the major.
        brand_version: `${form.brand_version_major}.0.0.0`,
        platform_version: form.platform_version || null,
        user_agent: form.user_agent || null,
        // Real → persist null (launcher reports the host's real value); Custom →
        // persist the chosen value (launcher spoofs it).
        hardware_concurrency:
          form.cpu_mode === 'real' || form.hardware_concurrency === ''
            ? null
            : form.hardware_concurrency,
        device_memory:
          form.ram_mode === 'real' || form.device_memory === ''
            ? null
            : form.device_memory,
        // WebGL metadata. 'real' persists NO override (null vendor +
        // renderer) so buildFingerprintConfig omits gpu.vendor/renderer
        // and the patched engine reports the host's actual GPU. 'custom'
        // persists the chosen spoof strings.
        webgl_vendor: form.webgl_mode === 'real' ? null : form.webgl_vendor,
        webgl_renderer: form.webgl_mode === 'real' ? null : form.webgl_renderer || null,
        webgpu_mode: form.webgpu_mode,
        // Derived flag: true iff the saved form matches the preset. Stored so
        // the toggle can show the "Custom" partial hint after a later edit.
        google_optimized: matchesOptimized(form),
        timezone_mode: form.timezone_mode,
        timezone: form.timezone,
        language_mode: form.language_mode,
        language: form.language,
        webrtc_mode: form.webrtc_mode,
        noise_canvas: form.noise_canvas,
        noise_webgl_image: form.noise_webgl_image,
        noise_audiocontext: form.noise_audiocontext,
        noise_media_device: form.noise_media_device,
        noise_clientrects: form.noise_clientrects,
        noise_speechvoices: form.noise_speechvoices,
        location_mode: form.location_mode,
        location_lat: form.location_lat === '' ? null : form.location_lat,
        location_lon: form.location_lon === '' ? null : form.location_lon,
        location_prompt: form.location_prompt,
        display_language_mode: form.display_language_mode,
        display_language: form.display_language || null,
        fonts_mode: form.fonts_mode,
        fonts_list:
          form.fonts_mode === 'custom'
            ? form.fonts_list_text
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean)
            : null,
        device_name: form.device_name || null,
        mac_address: form.mac_address || null,
        port_scan_protection: form.port_scan_protection,
        allowed_ports: form.allowed_ports || null,
        // If user picked custom resolution, persist that as the
        // screen_resolution string so the launcher just reads one field.
        screen_resolution:
          form.resolution_mode === 'custom' && form.resolution_w && form.resolution_h
            ? `${form.resolution_w}x${form.resolution_h}`
            : form.screen_resolution || null
      })
      return { ok: true, row: r }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  useRegisterSaver('Fingerprint', async () => {
    const r = await persist()
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  })

  const onSave = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    const r = await persist()
    setSaving(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    if (r.row) onSaved?.(r.row)
  }

  return (
    <Section
      title="Fingerprint"
      subtitle={
        <span className="mono text-[11px]">seed: {form.fingerprint_seed} · changes apply on next launch</span>
      }
      action={
        <div className="flex gap-1.5">
          <button
            onClick={onNewFingerprint}
            className="px-2.5 py-1 text-[11px] font-medium border border-[var(--line)] rounded text-[var(--t1)] hover:bg-[var(--hover)] inline-flex items-center gap-1"
            title="Randomize every fingerprint dimension at once"
          >
            <NavIcon name="automation" size={12} />
            New fingerprint
          </button>
          <button
            onClick={onSave}
            disabled={!dirty || saving}
            className="px-2.5 py-1 text-[11px] font-medium bg-[var(--red)] text-white rounded hover:bg-[var(--red-hover)] disabled:opacity-40 inline-flex items-center gap-1"
          >
            <Save className="w-3 h-3" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      {error && <div className="mb-3 text-[11px] text-[var(--red)]">{error}</div>}

      {/* Google/YouTube Optimized — one-switch preset. Derived on/off:
          editing any preset field flips it to the "Custom" partial hint. */}
      <div className="mb-3 px-3 py-2.5 bg-[var(--panel-2)]/50 border border-[var(--line)] rounded-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--t1)]">
                Google / YouTube Optimized (good for Faceless YouTube)
              </span>
              {!optimizedOn && savedOptimized && (
                <span className="text-[10px] font-medium text-[var(--red)] border border-[var(--red)]/40 rounded px-1 py-px">
                  Custom
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={optimizedOn}
            aria-label="Google / YouTube Optimized (good for Faceless YouTube)"
            onClick={() => setOptimized(!optimizedOn)}
            className={
              optimizedOn
                ? 'relative inline-flex h-5 w-9 shrink-0 rounded-full bg-[var(--red)] transition-colors mt-0.5'
                : 'relative inline-flex h-5 w-9 shrink-0 rounded-full bg-[var(--hover)] border border-[var(--line)] transition-colors mt-0.5'
            }
          >
            <span
              className={
                optimizedOn
                  ? 'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform translate-x-[18px] mt-[1px]'
                  : 'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform translate-x-[2px] mt-[1px]'
              }
            />
          </button>
        </div>
      </div>

      <Row label="Platform">
        <Seg
          value={form.platform as 'windows'|'macos'|'linux'}
          options={[
            { value: 'windows', label: 'Windows', tip: 'Spoof Windows 10/11 — most common desktop fingerprint' },
            { value: 'macos', label: 'macOS', tip: 'Spoof macOS — pairs with Apple GPU vendor only' },
            { value: 'linux', label: 'Linux', tip: 'Spoof Linux — niche; some sites flag Linux UAs as suspicious' }
          ]}
          onChange={(v) => update({ platform: v })}
        />
      </Row>
      <Row label="OS version">
        <select
          value={form.platform_version}
          onChange={(e) => update({ platform_version: e.target.value })}
          className={inputCls}
        >
          {osVersionsFor(form.platform).map((o) => (
            <option key={o.label} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Browser version">
        <select
          value={form.brand_version_major}
          onChange={(e) => update({ brand_version_major: e.target.value })}
          className={inputCls}
        >
          {browserVersionsFor(form.platform).map((v) => (
            <option key={v} value={v}>Chromium {v}</option>
          ))}
        </select>
      </Row>
      <Row label="User-Agent">
        <textarea rows={2} value={form.user_agent} onChange={(e) => update({ user_agent: e.target.value })} placeholder="Auto-derived if blank" className={`${inputCls} resize-none mono text-[10px]`} />
      </Row>

      <Row label="WebRTC">
        <div className="flex flex-col gap-1.5">
          <Seg value={form.webrtc_mode} options={[
            { value: 'forward', label: 'Forward', tip: 'Drop public-IP ICE candidates so sites only see the proxy IP via WebRTC — recommended for Google/YouTube' },
            { value: 'replace', label: 'Replace', tip: 'Rewrite every public IP in WebRTC candidates to the proxy IP — same goal as Forward, friendlier to sites that require an IP candidate' },
            { value: 'real', label: 'Real', tip: 'Expose the host’s real IP via WebRTC — only safe with no proxy or full trust' },
            { value: 'disabled', label: 'Disabled', tip: 'Block WebRTC entirely — breaks video calls + voice but eliminates IP leaks' },
            { value: 'proxy_udp', label: 'Proxy UDP', tip: 'Tunnel WebRTC UDP through the proxy. Engine support v1.1 (needs SOCKS5-UDP).' }
          ]} onChange={(v) => update({ webrtc_mode: v })} />
          {form.webrtc_mode === 'proxy_udp' && (
            <span className="text-[10px] text-[var(--t4)]">
              <b>Proxy UDP</b> saves now but doesn’t apply yet — needs SOCKS5 UDP tunneling (v1.1).
              For most users, <b>Forward</b> achieves the same goal.
            </span>
          )}
        </div>
      </Row>
      <Row label="Timezone">
        <div className="flex flex-col gap-1.5">
          <Seg value={form.timezone_mode} options={[
            { value: 'real', label: 'Real', tip: 'Use this machine’s actual timezone' },
            { value: 'based_on_ip', label: 'Based on IP', tip: 'Auto-derive from the proxy egress IP at every launch' },
            { value: 'custom', label: 'Custom', tip: 'Lock to a specific timezone you choose below' }
          ]} onChange={(v) => update({ timezone_mode: v })} />
          {form.timezone_mode === 'custom' && (
            <select
              value={form.timezone || ''}
              onChange={(e) => update({ timezone: e.target.value })}
              className={inputCls}
            >
              <option value="" disabled>Select a timezone…</option>
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          )}
        </div>
      </Row>
      <Row label="Language">
        <div className="flex flex-col gap-1.5">
          <Seg value={form.language_mode} options={[
            { value: 'real', label: 'Real', tip: 'Use this machine’s actual language preference' },
            { value: 'based_on_ip', label: 'Based on IP', tip: 'Auto-derive from the proxy egress country at every launch' },
            { value: 'custom', label: 'Custom', tip: 'Lock to a specific BCP-47 language tag (e.g. en-US, fr-FR)' }
          ]} onChange={(v) => update({ language_mode: v })} />
          {form.language_mode === 'custom' && (
            <input type="text" value={form.language} onChange={(e) => update({ language: e.target.value })} className={inputCls} />
          )}
        </div>
      </Row>
      <Row label="Location">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.location_mode}
            options={[
              { value: 'real', label: 'Real', tip: 'Let the browser request the device’s real location (HTML5 geolocation)' },
              { value: 'based_on_ip', label: 'Based on IP', tip: 'Derive coordinates from the proxy egress IP — coarse but consistent with the rest of the fingerprint' },
              { value: 'custom', label: 'Custom', tip: 'Pin a specific lat/lon you choose below' },
              { value: 'block', label: 'Block', tip: 'Reject every getCurrentPosition() call' }
            ]}
            onChange={(v) => update({ location_mode: v })}
          />
          {form.location_mode === 'custom' && (
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={form.location_lat}
                onChange={(e) =>
                  update({ location_lat: e.target.value === '' ? '' : Number(e.target.value) })
                }
                className={inputCls}
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={form.location_lon}
                onChange={(e) =>
                  update({ location_lon: e.target.value === '' ? '' : Number(e.target.value) })
                }
                className={inputCls}
              />
            </div>
          )}
          {form.location_mode !== 'block' && (
            <Seg
              value={form.location_prompt}
              options={[
                { value: 'ask', label: 'Ask each time', tip: 'Standard browser behavior: prompt on first request per site' },
                { value: 'always_allow', label: 'Always allow', tip: 'Auto-grant the permission so sites never see a prompt' }
              ]}
              onChange={(v) => update({ location_prompt: v })}
            />
          )}
        </div>
      </Row>

      <Row label="Display language">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.display_language_mode}
            options={[
              { value: 'based_on_language', label: 'Based on Language', tip: 'Mirror the Language setting above — the most common case' },
              { value: 'real', label: 'Real', tip: 'Use this machine’s actual UI language' },
              { value: 'custom', label: 'Custom', tip: 'Set a different display language than the navigator.language value' }
            ]}
            onChange={(v) => update({ display_language_mode: v })}
          />
          {form.display_language_mode === 'custom' && (
            <input
              type="text"
              value={form.display_language}
              onChange={(e) => update({ display_language: e.target.value })}
              placeholder="e.g. en-US"
              className={inputCls}
            />
          )}
        </div>
      </Row>

      <Row label="Screen resolution">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.resolution_mode}
            options={[
              { value: 'predefined', label: 'Predefined', tip: 'Pick from common monitor sizes' },
              { value: 'custom', label: 'Custom', tip: 'Specify exact width × height in pixels' }
            ]}
            onChange={(v) => {
              // Keep screen_resolution + resolution_w/h ALWAYS consistent across a
              // mode switch, so Save (which reads w/h in custom mode) never writes a
              // stale earlier value. Switching to Custom seeds the inputs from the
              // current resolution; switching to Predefined snaps to a real option.
              if (v === 'predefined') {
                const val = RES_OPTIONS.includes(form.screen_resolution)
                  ? form.screen_resolution
                  : RES_OPTIONS[0]
                const [w, h] = val.split('x').map(Number)
                update({ resolution_mode: v, screen_resolution: val, resolution_w: w, resolution_h: h })
              } else {
                const [w, h] = (form.screen_resolution || '').split('x').map(Number)
                update({
                  resolution_mode: v,
                  resolution_w: w > 0 ? w : form.resolution_w,
                  resolution_h: h > 0 ? h : form.resolution_h
                })
              }
            }}
          />
          {form.resolution_mode === 'predefined' ? (
            <select
              value={form.screen_resolution}
              onChange={(e) => {
                // Sync the custom inputs too, so the value is identical no matter
                // which mode Save happens to read.
                const [w, h] = e.target.value.split('x').map(Number)
                update({ screen_resolution: e.target.value, resolution_w: w || '', resolution_h: h || '' })
              }}
              className={inputCls}
            >
              {RES_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                min={400}
                max={7680}
                placeholder="Width"
                value={form.resolution_w}
                onChange={(e) => {
                  const w = e.target.value === '' ? '' : Number(e.target.value)
                  // Keep screen_resolution (what the Overview shows + Save reads)
                  // in sync as you type, so the right-hand panel updates live.
                  update({ resolution_w: w, screen_resolution: `${w || ''}x${form.resolution_h || ''}` })
                }}
                className={inputCls}
              />
              <input
                type="number"
                min={300}
                max={4320}
                placeholder="Height"
                value={form.resolution_h}
                onChange={(e) => {
                  const h = e.target.value === '' ? '' : Number(e.target.value)
                  update({ resolution_h: h, screen_resolution: `${form.resolution_w || ''}x${h || ''}` })
                }}
                className={inputCls}
              />
            </div>
          )}
        </div>
      </Row>

      <Row label="Fonts">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.fonts_mode}
            options={[
              { value: 'default', label: 'Default', tip: 'Expose the standard system font list' },
              { value: 'custom', label: 'Custom', tip: 'Provide a custom list of fonts to expose' }
            ]}
            onChange={(v) => update({ fonts_mode: v })}
          />
          {form.fonts_mode === 'custom' && (
            <textarea
              rows={3}
              placeholder="One font name per line, e.g.\nArial\nHelvetica\nGeorgia"
              value={form.fonts_list_text}
              onChange={(e) => update({ fonts_list_text: e.target.value })}
              className={`${inputCls} resize-y`}
            />
          )}
          {form.fonts_mode === 'custom' && (
            <span className="text-[10px] text-[var(--t4)]">
              Saved now — engine-side font filtering lands in v1.1.
            </span>
          )}
        </div>
      </Row>
      <Row label="CPU cores">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.cpu_mode}
            options={[
              { value: 'real', label: 'Real', tip: 'Report this machine’s actual CPU core count' },
              { value: 'custom', label: 'Custom', tip: 'Spoof a specific navigator.hardwareConcurrency' }
            ]}
            onChange={(v) => update({ cpu_mode: v as 'real' | 'custom' })}
          />
          {form.cpu_mode === 'custom' && (
            <select
              value={form.hardware_concurrency}
              onChange={(e) => update({ hardware_concurrency: Number(e.target.value) })}
              className={inputCls}
            >
              {withCurrent(CPU_CORE_OPTIONS, form.hardware_concurrency).map((c) => (
                <option key={c} value={c}>{c} cores</option>
              ))}
            </select>
          )}
        </div>
      </Row>
      <Row label="RAM (GB)">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.ram_mode}
            options={[
              { value: 'real', label: 'Real', tip: 'Report this machine’s actual memory (rounded by the spec)' },
              { value: 'custom', label: 'Custom', tip: 'Spoof a specific navigator.deviceMemory' }
            ]}
            onChange={(v) => update({ ram_mode: v as 'real' | 'custom' })}
          />
          {form.ram_mode === 'custom' && (
            <>
              <select
                value={form.device_memory}
                onChange={(e) => update({ device_memory: Number(e.target.value) })}
                className={inputCls}
              >
                {withCurrent(RAM_GB_OPTIONS, form.device_memory).map((g) => (
                  <option key={g} value={g}>{g} GB</option>
                ))}
              </select>
              <span className="text-[10px] text-[var(--t4)]">
                <code className="mono">navigator.deviceMemory</code> is capped at 8&nbsp;GB by the spec — 16/32/64/128
                are reported to sites as 8 (the engine quantizes), so a high value just reflects the
                machine you&apos;re modelling and is never a tell.
              </span>
            </>
          )}
        </div>
      </Row>
      <Row label="WebGL metadata">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.webgl_mode}
            options={[
              { value: 'real', label: 'Real', tip: 'Report this machine’s actual GPU — coherent on any host (recommended)' },
              { value: 'custom', label: 'Custom', tip: 'Spoof a specific GPU vendor + renderer. Note: on a same-platform profile the real GPU still renders the pixels, so a detector can flag the mismatch — Real is the safer default.' }
            ]}
            onChange={(v) => update({ webgl_mode: v as 'real' | 'custom' })}
          />
          {form.webgl_mode === 'custom' && (
            <>
              <select
                value={form.webgl_vendor}
                onChange={(e) => {
                  const v = e.target.value as WebGLVendor
                  update({ webgl_vendor: v, webgl_renderer: WEBGL_RENDERERS_BY_VENDOR[v]?.[0] ?? '' })
                }}
                className={inputCls}
                aria-label="WebGL vendor"
              >
                {WEBGL_VENDORS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select
                value={form.webgl_renderer}
                onChange={(e) => update({ webgl_renderer: e.target.value })}
                className={inputCls}
                aria-label="WebGL renderer"
              >
                {(WEBGL_RENDERERS_BY_VENDOR[form.webgl_vendor] ?? []).map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </Row>
      <Row label="WebGPU">
        <Seg
          value={form.webgpu_mode}
          options={[
            { value: 'based_on_webgl', label: 'Based on WebGL', tip: 'Mirror the WebGL vendor/renderer to WebGPU — the most consistent default' },
            { value: 'real', label: 'Real', tip: 'Expose the host machine’s actual WebGPU adapter (less spoofed but never mismatches WebGL)' },
            { value: 'disabled', label: 'Disabled', tip: 'Block WebGPU entirely — sites can detect this but can’t fingerprint your GPU' }
          ]}
          onChange={(v) => update({ webgpu_mode: v })}
        />
      </Row>

      <Row label="Hardware noise">
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
            {/* Canvas / WebGL Image / AudioContext / ClientRects toggles are
                INTERACTIVE (user preference, on/off) but COSMETIC: the engine
                always reports REAL values for these four (flag-builder emits the
                kill-switches + fingerprint-config forces audio.disable), because
                any perturbation of these hardware fingerprints is detectable
                (browserscan "modified manually"). Flipping them changes only the
                stored preference + the Overview label — never the real value. */}
            <NoiseToggle
              label="Canvas"
              checked={form.noise_canvas}
              onChange={() => update({ noise_canvas: !form.noise_canvas })}
            />
            <NoiseToggle
              label="WebGL Image"
              checked={form.noise_webgl_image}
              onChange={() => update({ noise_webgl_image: !form.noise_webgl_image })}
            />
            <NoiseToggle
              label="AudioContext"
              checked={form.noise_audiocontext}
              onChange={() => update({ noise_audiocontext: !form.noise_audiocontext })}
            />
            <NoiseToggle
              label="Media device"
              checked={form.noise_media_device}
              title="Device IDs are already unique per profile — the engine salts them per profile (patch 042)."
              onChange={() => update({ noise_media_device: !form.noise_media_device })}
            />
            <NoiseToggle
              label="ClientRects"
              checked={form.noise_clientrects}
              onChange={() => update({ noise_clientrects: !form.noise_clientrects })}
            />
            <NoiseToggle
              label="SpeechVoices"
              checked={form.noise_speechvoices}
              title="On: OS-coherent voice list per profile language (patch 029, recommended). Off: genuine host voices — only applied on a same-OS profile (ignored on a cross-platform spoof, where it would leak the host OS)."
              onChange={() => update({ noise_speechvoices: !form.noise_speechvoices })}
            />
          </div>
          <span className="text-[10px] text-[var(--t4)]">
            Per-profile hardware-fingerprint protection. Canvas, WebGL Image,
            AudioContext and ClientRects report stable, consistent values that pass
            pixelscan / browserscan checks. Media device and SpeechVoices are unique
            per profile (device-ID salt / locale voices).
          </span>
        </div>
      </Row>

      {/* "Show advanced" toggle. Hides Device name / MAC / Port scan
          by default — they're saved-only / power-user fields and
          add visual weight non-technical users don't need. */}
      <div className="my-3 border-t border-[var(--line)] pt-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-[11px] font-semibold text-[var(--t3)] hover:text-[var(--red)]"
        >
          {showAdvanced ? '− Hide advanced' : '+ Show advanced'}
        </button>
      </div>

      {showAdvanced && (
        <>
      <Row label="Device name">
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            value={form.device_name}
            onChange={(e) => update({ device_name: e.target.value })}
            placeholder="e.g. Akeem's MacBook Pro"
            className={inputCls}
          />
          <span className="text-[10px] text-[var(--t4)]">
            Cosmetic — saved with the profile. Browsers don’t expose hostname to web pages, so
            sites can’t fingerprint this directly. Useful for organizing your own profiles.
          </span>
        </div>
      </Row>

      <Row label="MAC Address">
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            value={form.mac_address}
            onChange={(e) => update({ mac_address: e.target.value })}
            placeholder="dc:2b:2a:1f:92:7a"
            className={`${inputCls} mono`}
          />
          <span className="text-[10px] text-[var(--t4)]">
            Saved for record-keeping. Browsers can’t read MAC addresses from JavaScript — this
            is here for parity with other anti-detect tools, not active spoofing.
          </span>
        </div>
      </Row>

      <Row label="Port scan protection">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.port_scan_protection ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'Enable', tip: 'Block sites from scanning your local network ports via private network access' },
              { value: 'off', label: 'Disable', tip: 'Allow normal Chrome behavior (default)' }
            ]}
            onChange={(v) => update({ port_scan_protection: v === 'on' })}
          />
          {form.port_scan_protection && (
            <input
              type="text"
              value={form.allowed_ports}
              onChange={(e) => update({ allowed_ports: e.target.value })}
              placeholder="Optional. Comma-separated ports to allow, e.g. 3000,8080"
              className={`${inputCls} mono`}
            />
          )}
        </div>
      </Row>
        </>
      )}
    </Section>
  )
}
