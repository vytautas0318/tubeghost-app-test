// Seed the fingerprint Form from a saved profile row.
//
// Its own module so FingerprintCard exports only components (react-refresh)
// and bulk create can seed a shared base without importing the card.

import type { ProfileRow } from '@/lib/profiles'
import {
  browserVersionsFor,
  WEBGL_VENDORS,
  WEBGL_RENDERERS_BY_VENDOR,
  type WebGLVendor
} from './randomize'
import { RES_OPTIONS } from './fingerprintFields.types'
import type { Form, Mode3, WebGpuMode, WebRtcMode } from './fingerprintFields.types'

function majorVersion(v: string | null | undefined, platform = 'windows'): string {
  const fallback = browserVersionsFor(platform)[0] ?? '150'
  if (!v) return fallback
  const m = v.match(/^(\d+)/)
  return m ? m[1] : fallback
}

function defaultVendorFor(platform: string): WebGLVendor {
  if (platform === 'macos') return 'Google Inc. (Apple)'
  // Linux + Windows both default to Intel — most common discrete-less
  // device fingerprint and works as a safe fallback.
  return 'Google Inc. (Intel)'
}

export function rowToForm(p: ProfileRow): Form {
  const platform = p.platform ?? 'windows'
  const vendor = (WEBGL_VENDORS as readonly string[]).includes(p.webgl_vendor ?? '')
    ? (p.webgl_vendor as WebGLVendor)
    : defaultVendorFor(platform)
  // If no renderer is stored yet, give the user a sensible default
  // for their vendor so the field is never blank.
  const renderer = p.webgl_renderer || WEBGL_RENDERERS_BY_VENDOR[vendor][0] || ''
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
    location_mode:
      (p.location_mode as 'real' | 'based_on_ip' | 'custom' | 'block') ?? 'based_on_ip',
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
      p.screen_resolution &&
      /^\d+x\d+$/.test(p.screen_resolution) &&
      !RES_OPTIONS.includes(p.screen_resolution)
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
