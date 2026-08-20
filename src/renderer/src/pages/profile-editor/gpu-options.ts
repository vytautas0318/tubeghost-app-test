// WebGL vendor + renderer option lists for the profile editor's GPU dropdown.
// Split from devices-catalog.ts. Self-contained: WebGLVendor derives from
// WEBGL_VENDORS; the renderer/vendor maps key off it.

// Vendor → known-good WebGL renderer catalog. Lets the editor offer a
// dropdown of vendors and a coherent renderer per choice (instead of
// leaving the user to free-text strings that don't match real GPUs).
//
// Mesa is included for the Linux platform path — real Linux Chromium
// reports vendor strings like "Mesa" / "Mesa/X.org" rather than
// Google's ANGLE wrappers. Win/Mac users will never see Mesa in the
// dropdown because VENDORS_BY_PLATFORM filters it out.
// Full UNMASKED_VENDOR_WEBGL list, matching the Windows editor. Two
// families:
//   • "Google Inc. (X)" — the ANGLE-wrapped vendor strings modern
//     desktop Chrome reports (the GPU is driven through ANGLE).
//   • Raw vendors ("Apple Inc.", "Intel Inc.", "Qualcomm", "ARM",
//     "Mesa") — what older builds / Safari / mobile-class GPUs report
//     directly without the ANGLE wrapper.
// The Custom dropdown shows ALL of them regardless of platform (parity
// with the Windows app); VENDORS_BY_PLATFORM only seeds the coherent
// default when the user switches the spoofed OS.
export const WEBGL_VENDORS = [
  'Apple Inc.',
  'Google Inc. (AMD)',
  'Google Inc. (Intel)',
  'Google Inc. (NVIDIA)',
  'Google Inc. (Apple)',
  'Google Inc. (Microsoft)',
  'Google Inc. (Qualcomm)',
  'Intel Inc.',
  'Qualcomm',
  'ARM',
  'Mesa'
] as const

export type WebGLVendor = (typeof WEBGL_VENDORS)[number]

// Which vendor seeds the coherent default when the spoofed platform
// changes (e.g. switching to macOS → Apple GPU). The dropdown itself is
// no longer pruned by this — the user may pick any vendor — but the
// platform-switch auto-correct still uses [0] here so a fresh OS choice
// lands on a plausible GPU rather than a leftover incoherent one.
export const VENDORS_BY_PLATFORM: Record<string, readonly WebGLVendor[]> = {
  macos: ['Google Inc. (Apple)', 'Apple Inc.', 'Intel Inc.'],
  windows: [
    'Google Inc. (NVIDIA)',
    'Google Inc. (Intel)',
    'Google Inc. (AMD)',
    'Google Inc. (Microsoft)',
    'Google Inc. (Qualcomm)'
  ],
  linux: ['Mesa']
}

export const WEBGL_RENDERERS_BY_VENDOR: Record<WebGLVendor, string[]> = {
  'Apple Inc.': ['Apple GPU', 'Apple M1', 'Apple M2', 'Apple M3'],
  'Google Inc. (AMD)': [
    'ANGLE (AMD, AMD Radeon RX 7700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 7600 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)'
  ],
  'Google Inc. (Intel)': [
    'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) HD Graphics 530 Direct3D11 vs_5_0 ps_5_0, D3D11)'
  ],
  'Google Inc. (NVIDIA)': [
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)'
  ],
  'Google Inc. (Apple)': [
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)'
  ],
  'Google Inc. (Microsoft)': [
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)'
  ],
  'Google Inc. (Qualcomm)': [
    'ANGLE (Qualcomm, Adreno (TM) 690 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Qualcomm, Adreno (TM) 741 Direct3D11 vs_5_0 ps_5_0, D3D11)'
  ],
  'Intel Inc.': [
    'Intel(R) Iris(TM) Plus Graphics 640',
    'Intel(R) UHD Graphics 630',
    'Intel(R) Iris(TM) Graphics 6100',
    'Intel(R) HD Graphics 4000'
  ],
  Qualcomm: ['Adreno (TM) 640', 'Adreno (TM) 730', 'Adreno (TM) 750'],
  ARM: ['Mali-G78', 'Mali-G710', 'Mali-G57', 'Mali-G76'],
  Mesa: [
    'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
    'Mesa Intel(R) HD Graphics 530 (SKL GT2)',
    'Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2)',
    'AMD Radeon RX 6700 XT (RADV NAVI22)',
    'AMD Radeon RX 580 (RADV POLARIS10)'
  ]
}
