import type { WebGLVendor } from './randomize'

// Shared constants + the Form shape for the fingerprint fields.
//
// Split out of FingerprintCard so FingerprintFields (used by the editor AND
// bulk create) can import them without pulling in the card's save logic.

export const inputCls =
  'w-full px-2.5 py-1.5 text-xs bg-[var(--panel-2)] border border-[var(--line)] rounded-md text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30'

export const RES_OPTIONS = [
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

export type Mode3 = 'real' | 'based_on_ip' | 'custom'
export type WebRtcMode = 'forward' | 'replace' | 'real' | 'disabled' | 'proxy_udp'
export type WebGpuMode = 'based_on_webgl' | 'real' | 'disabled'

export interface Form {
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
  fonts_list_text: string // newline-separated, joined to text[] on save
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

export const CPU_CORE_OPTIONS = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 64]
export const RAM_GB_OPTIONS = [2, 4, 6, 8, 16, 32, 64, 128]

// Ensure the current value is selectable even if it's not a standard option
// (e.g. an archetype's 14 cores), so the dropdown never shows blank.

export function withCurrent(opts: number[], cur: number | ''): number[] {
  const n = Number(cur)
  return Number.isFinite(n) && n > 0 && !opts.includes(n)
    ? [...opts, n].sort((a, b) => a - b)
    : opts
}
