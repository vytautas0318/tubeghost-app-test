// The Simple editor's device/engine + fingerprint controls.
//
// These write real fields. The rule that governs every handler here: a write
// happens ONLY when the user operates the control. Opening a profile in Simple
// performs no writes at all — there is no normalize-on-open and no
// regenerate-on-save, so a hand-tuned profile round-trips untouched.
//
// Fields Simple never exposes (WebGL vendor/renderer, canvas/audio/font noise,
// locale, timezone, launch args) are not written here — except where platform
// coherence demands it, which is delegated to platformCoherencePatch so a
// device switch means exactly what it means in Advanced.

import * as React from 'react'
import { Fingerprint, Monitor } from 'lucide-react'
import { Toggle } from '@tubeghost/ui'
import { OsMark } from '@/pages/profiles-list/osFlag'
import { browserVersionsFor } from './randomize'
import { platformCoherencePatch } from './platformCoherence'
import { SaSelect } from './SaSelect'
import { OPTIMIZED_PRESET, isOptimizedOn } from './optimizedPreset'
import type { SimpleDraft } from './useSimpleDraft'

export function DeviceTile({
  draft,
  patch,
  disabled
}: {
  draft: SimpleDraft
  patch: (p: Partial<SimpleDraft>) => void
  disabled: boolean
}): React.ReactElement {
  const versions = browserVersionsFor(draft.platform)

  const setPlatform = (platform: string): void => {
    if (platform === draft.platform) return
    // Apply the same coherence rules Advanced applies, computed against the
    // already-switched platform.
    const coherence = platformCoherencePatch({ ...draft, platform })
    patch({ platform, ...coherence })
  }

  return (
    <div className="sa-tile">
      <div className="sa-tk">
        <Monitor />
        Device &amp; engine
      </div>
      <div className="sa-pick">
        {(['windows', 'macos'] as const).map((os) => (
          <button
            type="button"
            key={os}
            disabled={disabled}
            className={'sa-opt' + (draft.platform === os ? ' on' : '')}
            onClick={() => setPlatform(os)}
          >
            <OsMark platform={os} className="shrink-0" />
            {os === 'macos' ? 'macOS' : 'Windows'}
          </button>
        ))}
      </div>
      <SaSelect
        value={draft.brand_version_major}
        ariaLabel="Browser version"
        disabled={disabled}
        onChange={(v) => patch({ brand_version_major: v })}
        options={versions.map((v, i) => ({
          value: v,
          label: i === 0 ? `Latest Chromium ${v}` : `Chromium ${v}`
        }))}
      />
      <div className="sa-hint">
        Latest is recommended. Every signal is generated to match this device.
      </div>
    </div>
  )
}

export function FingerprintTile({
  draft,
  patch,
  disabled,
  onToast
}: {
  draft: SimpleDraft
  patch: (p: Partial<SimpleDraft>) => void
  disabled: boolean
  onToast?: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  // Stored intent AND live field match — see isOptimizedOn. Deriving from the
  // fields alone made the switch impossible to turn off, because the preset's
  // values are also the app's defaults.
  const optimizedOn = isOptimizedOn(draft)

  const reseed = (): void => {
    // Only the seed. Every other fingerprint field is left as-is: the seed is
    // what drives canvas/audio/WebGL noise, so rerolling it is sufficient and
    // regenerating the whole device would discard the user's choices.
    patch({ fingerprint_seed: Math.floor(Math.random() * 2_147_483_647) })
    onToast?.('info', 'New fingerprint generated')
  }

  const setOptimized = (on: boolean): void => {
    if (on) {
      // The preset is locale/WebRTC/WebGPU only — it deliberately does not
      // touch WebGL, so turning this on never spoofs the GPU. Custom GPU stays
      // an explicit Advanced choice (a same-platform spoof is detectable).
      patch({ ...OPTIMIZED_PRESET, google_optimized: true })
    } else {
      // Releases the flag and leaves every value in place: flipping the switch
      // off must not rewrite the user's locale/WebRTC choices.
      patch({ google_optimized: false })
    }
  }

  return (
    <div className="sa-tile">
      <div className="sa-tk">
        <Fingerprint />
        Fingerprint
      </div>
      <div className="sa-seedrow">
        <span className="sa-seed">{draft.fingerprint_seed}</span>
        <button type="button" className="sa-reroll" onClick={reseed} disabled={disabled}>
          <Fingerprint />
          New
        </button>
      </div>
      <label className="sa-switch">
        <Toggle checked={optimizedOn} onChange={setOptimized} disabled={disabled} />
        <span>Optimized for YouTube</span>
      </label>
      <div className="sa-hint">Tuned to the signals YouTube reads.</div>
    </div>
  )
}
