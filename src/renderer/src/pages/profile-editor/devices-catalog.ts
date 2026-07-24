// GPU + device archetype catalog for the random fingerprint generator.
// Split from randomize.ts (250-line cap). Pure data: each entry is one real
// shipping device with CPU/RAM/GPU/screen locked together.

export interface DevicePreset {
  label: string                 // human-readable, e.g. "MacBook Pro M3 Max"
  platform: 'windows' | 'macos' | 'linux'
  platform_version: string
  brand: 'Chrome' | 'Edge' | 'Opera' | 'Vivaldi'
  // UA template — '__V__' is replaced with the chosen Chromium major
  // (e.g. '148.0.0.0').
  user_agent_tmpl: string
  webgl_vendor: string
  webgl_renderer: string
  hardware_concurrency: number
  device_memory: number
  screen_resolution: string
}

// Windows UA template
export const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/__V__ Safari/537.36'

// Mac UA template — Chrome on Mac always reports the spoofed OS X 10_15_7
// for compatibility with sites that gate on legacy strings, even on
// modern macOS. Matches what real Chrome ships.
export const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/__V__ Safari/537.36'

export const LIN_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/__V__ Safari/537.36'

export const DEVICES: DevicePreset[] = [
  // ── macOS — Apple Silicon ─────────────────────────────────────
  {
    label: 'MacBook Air M1 (8GB)',
    platform: 'macos', platform_version: '14.5.0', brand: 'Chrome',
    user_agent_tmpl: MAC_UA,
    webgl_vendor: 'Google Inc. (Apple)',
    webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
    hardware_concurrency: 8, device_memory: 8, screen_resolution: '2560x1664'
  },
  {
    label: 'MacBook Air M1 (16GB)',
    platform: 'macos', platform_version: '14.5.0', brand: 'Chrome',
    user_agent_tmpl: MAC_UA,
    webgl_vendor: 'Google Inc. (Apple)',
    webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
    hardware_concurrency: 8, device_memory: 16, screen_resolution: '2560x1664'
  },
  {
    label: 'MacBook Air M2',
    platform: 'macos', platform_version: '14.5.0', brand: 'Chrome',
    user_agent_tmpl: MAC_UA,
    webgl_vendor: 'Google Inc. (Apple)',
    webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
    hardware_concurrency: 8, device_memory: 16, screen_resolution: '2560x1664'
  },
  {
    label: 'MacBook Pro 14" M2 Pro',
    platform: 'macos', platform_version: '14.5.0', brand: 'Chrome',
    user_agent_tmpl: MAC_UA,
    webgl_vendor: 'Google Inc. (Apple)',
    webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
    hardware_concurrency: 12, device_memory: 16, screen_resolution: '3024x1964'
  },
  {
    label: 'MacBook Pro 14" M2 Pro (32GB)',
    platform: 'macos', platform_version: '14.5.0', brand: 'Chrome',
    user_agent_tmpl: MAC_UA,
    webgl_vendor: 'Google Inc. (Apple)',
    webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
    hardware_concurrency: 12, device_memory: 32, screen_resolution: '3024x1964'
  },
  {
    label: 'MacBook Pro 14" M3',
    platform: 'macos', platform_version: '14.5.0', brand: 'Chrome',
    user_agent_tmpl: MAC_UA,
    webgl_vendor: 'Google Inc. (Apple)',
    webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
    hardware_concurrency: 8, device_memory: 16, screen_resolution: '3024x1964'
  },
  {
    label: 'MacBook Pro 16" M3 Max',
    platform: 'macos', platform_version: '14.5.0', brand: 'Chrome',
    user_agent_tmpl: MAC_UA,
    webgl_vendor: 'Google Inc. (Apple)',
    webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)',
    // 16-core M3 Max (the upgraded config) — a real value that is ALSO in the
    // editor's CPU_CORE_OPTIONS, so "New fingerprint" never injects an off-list
    // count. Every preset's hardware_concurrency/device_memory must stay within
    // CPU_CORE_OPTIONS / RAM_GB_OPTIONS (FingerprintCard.tsx).
    hardware_concurrency: 16, device_memory: 32, screen_resolution: '3456x2234'
  },
  {
    label: 'iMac M3',
    platform: 'macos', platform_version: '14.5.0', brand: 'Chrome',
    user_agent_tmpl: MAC_UA,
    webgl_vendor: 'Google Inc. (Apple)',
    webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
    hardware_concurrency: 8, device_memory: 16, screen_resolution: '4480x2520'
  },
  {
    label: 'MacBook Pro 16" M1 Max',
    platform: 'macos', platform_version: '14.5.0', brand: 'Chrome',
    user_agent_tmpl: MAC_UA,
    webgl_vendor: 'Google Inc. (Apple)',
    webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)',
    hardware_concurrency: 10, device_memory: 32, screen_resolution: '3456x2234'
  },
  {
    label: 'MacBook Pro 16" M2 Max',
    platform: 'macos', platform_version: '14.5.0', brand: 'Chrome',
    user_agent_tmpl: MAC_UA,
    webgl_vendor: 'Google Inc. (Apple)',
    webgl_renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)',
    hardware_concurrency: 12, device_memory: 32, screen_resolution: '3456x2234'
  },
  // ── Windows — Intel/NVIDIA gaming desktop class ───────────────
  {
    label: 'Windows 11 desktop, RTX 4060',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (NVIDIA)',
    webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 12, device_memory: 16, screen_resolution: '1920x1080'
  },
  {
    label: 'Windows 11 desktop, RTX 4070',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (NVIDIA)',
    webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 16, device_memory: 32, screen_resolution: '2560x1440'
  },
  {
    label: 'Windows 11 desktop, RTX 3070',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (NVIDIA)',
    webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 12, device_memory: 16, screen_resolution: '1920x1080'
  },
  {
    label: 'Windows 11 desktop, GTX 1660 SUPER',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (NVIDIA)',
    webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 8, device_memory: 16, screen_resolution: '1920x1080'
  },
  // ── Windows — Intel iGPU (laptops + low-end desktops) ─────────
  {
    label: 'Windows 11 laptop, Intel Iris Xe',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (Intel)',
    webgl_renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 8, device_memory: 16, screen_resolution: '1920x1080'
  },
  {
    label: 'Windows 10 laptop, Intel UHD 630',
    platform: 'windows', platform_version: '10.0.19045', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (Intel)',
    webgl_renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 4, device_memory: 8, screen_resolution: '1366x768'
  },
  {
    label: 'Windows 10 laptop, Intel HD 530',
    platform: 'windows', platform_version: '10.0.19045', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (Intel)',
    webgl_renderer: 'ANGLE (Intel, Intel(R) HD Graphics 530 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 4, device_memory: 8, screen_resolution: '1920x1080'
  },
  // ── Windows — AMD Radeon (gaming + creator desktops) ──────────
  {
    label: 'Windows 11 desktop, RX 6700 XT',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (AMD)',
    webgl_renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 12, device_memory: 16, screen_resolution: '2560x1440'
  },
  {
    label: 'Windows 11 desktop, RX 7600',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (AMD)',
    webgl_renderer: 'ANGLE (AMD, AMD Radeon RX 7600 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 12, device_memory: 16, screen_resolution: '1920x1080'
  },
  {
    label: 'Windows 11 desktop, RTX 4090',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (NVIDIA)',
    webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 24, device_memory: 64, screen_resolution: '3840x2160'
  },
  {
    label: 'Windows 11 desktop, RTX 4080',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (NVIDIA)',
    webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 16, device_memory: 32, screen_resolution: '2560x1440'
  },
  {
    label: 'Windows 11 desktop, RTX 4060 Ti',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (NVIDIA)',
    webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 12, device_memory: 16, screen_resolution: '2560x1440'
  },
  {
    label: 'Windows 11 desktop, RTX 3080',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (NVIDIA)',
    webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 16, device_memory: 32, screen_resolution: '2560x1440'
  },
  {
    label: 'Windows 11 desktop, RTX 3060',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (NVIDIA)',
    webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 12, device_memory: 16, screen_resolution: '1920x1080'
  },
  {
    label: 'Windows 10 desktop, RTX 2060',
    platform: 'windows', platform_version: '10.0.19045', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (NVIDIA)',
    webgl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 8, device_memory: 16, screen_resolution: '1920x1080'
  },
  {
    label: 'Windows 11 desktop, RX 6600',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (AMD)',
    webgl_renderer: 'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 12, device_memory: 16, screen_resolution: '1920x1080'
  },
  {
    label: 'Windows 11 desktop, RX 7700 XT',
    platform: 'windows', platform_version: '10.0.22631', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (AMD)',
    webgl_renderer: 'ANGLE (AMD, AMD Radeon RX 7700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 16, device_memory: 32, screen_resolution: '2560x1440'
  },
  {
    label: 'Windows 10 laptop, Intel UHD 620',
    platform: 'windows', platform_version: '10.0.19045', brand: 'Chrome',
    user_agent_tmpl: WIN_UA,
    webgl_vendor: 'Google Inc. (Intel)',
    webgl_renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardware_concurrency: 4, device_memory: 8, screen_resolution: '1920x1080'
  },
  // ── Linux — light coverage (long-tail audience) ───────────────
  {
    label: 'Linux desktop, Intel UHD',
    platform: 'linux', platform_version: '6.5.0', brand: 'Chrome',
    user_agent_tmpl: LIN_UA,
    webgl_vendor: 'Mesa',
    webgl_renderer: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
    hardware_concurrency: 8, device_memory: 16, screen_resolution: '1920x1080'
  },
  {
    label: 'Linux desktop, Radeon RX 6700 XT',
    platform: 'linux', platform_version: '6.5.0', brand: 'Chrome',
    user_agent_tmpl: LIN_UA,
    webgl_vendor: 'Mesa',
    webgl_renderer: 'AMD Radeon RX 6700 XT (RADV NAVI22)',
    hardware_concurrency: 16, device_memory: 32, screen_resolution: '2560x1440'
  }
]
