// Fields that must follow a platform change to stay coherent.
//
// Extracted from FingerprintCard's platform effect so the Simple editor's
// Windows/macOS toggle produces byte-identical results to the Advanced one —
// a device switch must mean the same thing in both views.
//
// Everything NOT returned here is left alone on purpose: a platform change must
// not touch the user's canvas/audio/font/locale/timezone choices.

import {
  VENDORS_BY_PLATFORM,
  WEBGL_VENDORS,
  WEBGL_RENDERERS_BY_VENDOR,
  browserVersionsFor,
  osVersionsFor,
  uaMatchesPlatform,
  userAgentFor,
  type WebGLVendor
} from './randomize'

export interface PlatformCoherenceInput {
  platform: string
  webgl_vendor: string
  brand_version_major: string
  platform_version: string
  user_agent: string
}

export interface PlatformCoherencePatch {
  webgl_vendor?: string
  webgl_renderer?: string
  brand_version_major?: string
  platform_version?: string
  user_agent?: string
}

/**
 * Given a form already switched to `platform`, return only the fields that must
 * change to stay coherent with it. Returns an empty object when nothing needs
 * to move — callers can skip the write entirely.
 */
export function platformCoherencePatch(form: PlatformCoherenceInput): PlatformCoherencePatch {
  const allowedVendors = VENDORS_BY_PLATFORM[form.platform] ?? WEBGL_VENDORS
  const allowedVersions = browserVersionsFor(form.platform)
  const patch: PlatformCoherencePatch = {}

  // A GPU vendor that doesn't exist on the new platform (e.g. Apple on
  // Windows) is an instant tell — move to that platform's first vendor.
  if (!allowedVendors.includes(form.webgl_vendor as WebGLVendor)) {
    const v = allowedVendors[0]
    patch.webgl_vendor = v
    patch.webgl_renderer = WEBGL_RENDERERS_BY_VENDOR[v][0]
  }
  if (!allowedVersions.includes(form.brand_version_major)) {
    patch.brand_version_major = allowedVersions[0] ?? '150'
  }
  // Reset OS version to "All" when the current selection isn't valid on the
  // new platform (e.g. "Windows 11" → macOS).
  if (!osVersionsFor(form.platform).some((o) => o.value === form.platform_version)) {
    patch.platform_version = ''
  }
  // UA coherence — only regenerate when a UA is actually stored, so we don't
  // fight the "auto-derived if blank" placeholder.
  if (form.user_agent && !uaMatchesPlatform(form.user_agent, form.platform)) {
    const v = patch.brand_version_major ?? form.brand_version_major
    patch.user_agent = userAgentFor(form.platform, v)
  }
  return patch
}
