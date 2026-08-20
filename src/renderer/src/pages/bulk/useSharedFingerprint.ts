// The "Shared base" fingerprint for a bulk batch.
//
// Seeded from a freshly generated device so the form opens on something
// coherent rather than blank, then hand-tuned by the user. Applied to every
// profile in the batch — EXCEPT the per-profile seed and hardware noise, which
// stay unique so the profiles never share a canvas/audio hash.

import { useMemo, useState } from 'react'
import { rowToForm } from '@/pages/profile-editor/rowToForm'
import { formToProfilePatch } from '@/pages/profile-editor/formToProfilePatch'
import {
  generateRandomFingerprint,
  randomDeviceName,
  randomMacAddress
} from '@/pages/profile-editor/randomize'
import { isOptimizedOn } from '@/pages/profile-editor/optimizedPreset'
import type { Form } from '@/pages/profile-editor/fingerprintFields.types'
import type { ProfileRow } from '@/lib/profiles'

/** A synthetic row so rowToForm can seed the editor form without a saved profile. */
function seedRow(platform: string): ProfileRow {
  const fp = generateRandomFingerprint({ platform })
  return {
    fingerprint_seed: fp.fingerprint_seed,
    platform: fp.platform,
    platform_version: fp.platform_version,
    brand: fp.brand,
    brand_version: fp.brand_version,
    user_agent: fp.user_agent,
    webgl_vendor: fp.webgl_vendor,
    webgl_renderer: fp.webgl_renderer,
    hardware_concurrency: fp.hardware_concurrency,
    device_memory: fp.device_memory,
    screen_resolution: fp.screen_resolution,
    language: fp.language,
    timezone: fp.timezone,
    timezone_mode: 'based_on_ip',
    language_mode: 'based_on_ip',
    location_mode: 'based_on_ip',
    display_language_mode: 'based_on_language',
    webrtc_mode: 'forward',
    webgpu_mode: 'based_on_webgl',
    noise_canvas: fp.noise_canvas,
    noise_webgl_image: fp.noise_webgl_image,
    noise_audiocontext: fp.noise_audiocontext,
    noise_media_device: fp.noise_media_device,
    noise_clientrects: fp.noise_clientrects,
    noise_speechvoices: fp.noise_speechvoices,
    device_name: randomDeviceName(fp.platform),
    mac_address: randomMacAddress(),
    port_scan_protection: true,
    fonts_mode: 'default',
    google_optimized: true
  } as unknown as ProfileRow
}

export interface UseSharedFingerprint {
  fpBase: Form
  updateFpBase: (patch: Partial<Form>) => void
  /** Columns to apply to each created profile, minus the per-profile bits. */
  fpPatch: () => Record<string, unknown>
}

export function useSharedFingerprint(platform: string): UseSharedFingerprint {
  const [fpBase, setFpBase] = useState<Form>(() => rowToForm(seedRow(platform)))

  const updateFpBase = (patch: Partial<Form>): void => setFpBase((f) => ({ ...f, ...patch }))

  const fpPatch = useMemo(
    () => (): Record<string, unknown> => {
      const patch = formToProfilePatch(fpBase, isOptimizedOn(fpBase))
      // Per-profile by design: a shared seed would give every profile in the
      // batch an identical canvas/audio hash, which is the opposite of what
      // separate profiles are for. createProfile() has already set a unique
      // one, so simply don't overwrite it.
      delete patch.fingerprint_seed
      delete patch.device_name
      delete patch.mac_address
      return patch
    },
    [fpBase]
  )

  return { fpBase, updateFpBase, fpPatch }
}
