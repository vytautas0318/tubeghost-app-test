// Simple-editor draft state (identity + device + fingerprint).
//
// Proxy is deliberately NOT here: it is assigned through the data layer's
// assignProxyToProfile/detach calls (same as Advanced), which own encrypted
// credentials and the TubeProxies link.
//
// THE NON-DESTRUCTIVE GUARANTEE lives here. The draft is seeded from the saved
// row, but saving does NOT write the whole draft back — it writes only the keys
// the user actually touched, tracked in `touched`. So:
//
//   • opening a profile and saving without operating a control writes nothing;
//   • operating one control writes that field (plus whatever coherence
//     genuinely requires, e.g. UA following a platform change);
//   • fields Simple doesn't expose are never in the patch at all, so hand-tuned
//     WebGL / canvas / audio / font / locale / timezone values are physically
//     incapable of being clobbered by this path.

import { useMemo, useState } from 'react'
import type { ProfileRow } from '@/lib/profiles'
import { browserVersionsFor } from './randomize'

// Same derivation FingerprintCard uses (its copy is file-private).
function majorVersion(v: string | null | undefined, platform = 'windows'): string {
  const fallback = browserVersionsFor(platform)[0] ?? '150'
  if (!v) return fallback
  const m = v.match(/^(\d+)/)
  return m ? m[1] : fallback
}

export interface SimpleDraft {
  name: string
  group_id: string | null
  tags: string[]
  platform: string
  brand_version_major: string
  platform_version: string
  fingerprint_seed: number
  user_agent: string
  webgl_vendor: string
  webgl_renderer: string
  google_optimized: boolean
  // Derived, never stored: Advanced computes it as `webgl_vendor ? custom : real`
  // (FingerprintCard:227). matchesOptimized() reads it, so the draft carries it.
  webgl_mode: 'real' | 'custom'
  webrtc_mode: string
  timezone_mode: string
  language_mode: string
  location_mode: string
  display_language_mode: string
  webgpu_mode: string
}

export function rowToSimpleDraft(row: ProfileRow | null): SimpleDraft {
  return {
    name: row?.name ?? '',
    group_id: row?.group_id ?? null,
    tags: row?.tags ?? [],
    platform: row?.platform ?? 'macos',
    brand_version_major: majorVersion(row?.brand_version, row?.platform ?? 'macos'),
    platform_version: row?.platform_version ?? '',
    fingerprint_seed: row?.fingerprint_seed ?? 0,
    user_agent: row?.user_agent ?? '',
    webgl_vendor: row?.webgl_vendor ?? '',
    webgl_renderer: row?.webgl_renderer ?? '',
    // Defaults TRUE for a new profile (no row yet): every preset-controlled
    // field below already defaults to its preset value, and createProfile()
    // writes google_optimized: true — so seeding false would render the toggle
    // off while the profile is, in fact, optimized.
    google_optimized: row?.google_optimized ?? true,
    webgl_mode: row?.webgl_vendor ? 'custom' : 'real',
    webrtc_mode: row?.webrtc_mode ?? 'forward',
    timezone_mode: row?.timezone_mode ?? 'based_on_ip',
    language_mode: row?.language_mode ?? 'based_on_ip',
    location_mode: row?.location_mode ?? 'based_on_ip',
    display_language_mode: row?.display_language_mode ?? 'based_on_language',
    webgpu_mode: row?.webgpu_mode ?? 'based_on_webgl'
  }
}

export interface UseSimpleDraft {
  draft: SimpleDraft
  patch: (p: Partial<SimpleDraft>) => void
  dirty: boolean
  // The write set: only touched keys, mapped to their DB column shape.
  buildPatch: () => Record<string, unknown>
  reset: (row: ProfileRow | null) => void
}

export function useSimpleDraft(row: ProfileRow | null): UseSimpleDraft {
  const [draft, setDraft] = useState<SimpleDraft>(() => rowToSimpleDraft(row))
  const [touched, setTouched] = useState<Set<keyof SimpleDraft>>(() => new Set())
  // Re-seed when the underlying row identity changes (navigating between
  // profiles), without wiping an in-progress edit of the same profile.
  const [seededId, setSeededId] = useState<string | null>(row?.id ?? null)
  if ((row?.id ?? null) !== seededId) {
    setSeededId(row?.id ?? null)
    setDraft(rowToSimpleDraft(row))
    setTouched(new Set())
  }

  const patch = (p: Partial<SimpleDraft>): void => {
    setDraft((d) => ({ ...d, ...p }))
    setTouched((t) => {
      const next = new Set(t)
      for (const k of Object.keys(p) as (keyof SimpleDraft)[]) next.add(k)
      return next
    })
  }

  const dirty = touched.size > 0

  const buildPatch = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    // webgl_mode is derived, not a column — but it decides how the WebGL
    // strings persist: Real means NULL (report the host GPU), Custom means the
    // spoof strings. Mirrors FingerprintCard's save (`mode === 'real' ? null`).
    if (touched.has('webgl_mode') || touched.has('webgl_vendor')) {
      const real = draft.webgl_mode === 'real'
      out.webgl_vendor = real ? null : draft.webgl_vendor
      out.webgl_renderer = real ? null : draft.webgl_renderer
    }
    for (const k of touched) {
      if (k === 'webgl_mode' || k === 'webgl_vendor' || k === 'webgl_renderer') continue
      if (k === 'brand_version_major') {
        // Stored as the full quad version, matching Advanced.
        out.brand_version = `${draft.brand_version_major}.0.0.0`
        continue
      }
      out[k] = draft[k]
    }
    return out
  }

  const reset = (r: ProfileRow | null): void => {
    setDraft(rowToSimpleDraft(r))
    setTouched(new Set())
  }

  return useMemo(
    () => ({ draft, patch, dirty, buildPatch, reset }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, touched]
  )
}
