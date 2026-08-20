// Hardware rows of the fingerprint form.
//
// Split from FingerprintFields to keep each file reviewable. Every group takes
// the same (form, update) pair, so they compose into one form without any
// group owning state.

import * as React from 'react'
import { Row, Seg } from './seg'
import { WEBGL_RENDERERS_BY_VENDOR, WEBGL_VENDORS, type WebGLVendor } from './randomize'
import { NoiseToggle } from './NoiseToggle'
import {
  CPU_CORE_OPTIONS,
  RAM_GB_OPTIONS,
  RES_OPTIONS,
  inputCls,
  withCurrent
} from './fingerprintFields.types'
import type { Form } from './fingerprintFields.types'

export function FingerprintHardwareRows({
  form,
  update
}: {
  form: Form
  update: (patch: Partial<Form>) => void
}): React.ReactElement {
  return (
    <>
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
                update({
                  resolution_mode: v,
                  screen_resolution: val,
                  resolution_w: w,
                  resolution_h: h
                })
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
                update({
                  screen_resolution: e.target.value,
                  resolution_w: w || '',
                  resolution_h: h || ''
                })
              }}
              className={inputCls}
            >
              {RES_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
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
                  update({
                    resolution_w: w,
                    screen_resolution: `${w || ''}x${form.resolution_h || ''}`
                  })
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
                  update({
                    resolution_h: h,
                    screen_resolution: `${form.resolution_w || ''}x${h || ''}`
                  })
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
              {
                value: 'custom',
                label: 'Custom',
                tip: 'Spoof a specific navigator.hardwareConcurrency'
              }
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
                <option key={c} value={c}>
                  {c} cores
                </option>
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
              {
                value: 'real',
                label: 'Real',
                tip: 'Report this machine’s actual memory (rounded by the spec)'
              },
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
                  <option key={g} value={g}>
                    {g} GB
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-[var(--t4)]">
                <code className="mono">navigator.deviceMemory</code> is capped at 8&nbsp;GB by the
                spec — 16/32/64/128 are reported to sites as 8 (the engine quantizes), so a high
                value just reflects the machine you&apos;re modelling and is never a tell.
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
              {
                value: 'real',
                label: 'Real',
                tip: 'Report this machine’s actual GPU — coherent on any host (recommended)'
              },
              {
                value: 'custom',
                label: 'Custom',
                tip: 'Spoof a specific GPU vendor + renderer. Note: on a same-platform profile the real GPU still renders the pixels, so a detector can flag the mismatch — Real is the safer default.'
              }
            ]}
            onChange={(v) => update({ webgl_mode: v as 'real' | 'custom' })}
          />
          {form.webgl_mode === 'custom' && (
            <>
              <select
                value={form.webgl_vendor}
                onChange={(e) => {
                  const v = e.target.value as WebGLVendor
                  update({
                    webgl_vendor: v,
                    webgl_renderer: WEBGL_RENDERERS_BY_VENDOR[v]?.[0] ?? ''
                  })
                }}
                className={inputCls}
                aria-label="WebGL vendor"
              >
                {WEBGL_VENDORS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={form.webgl_renderer}
                onChange={(e) => update({ webgl_renderer: e.target.value })}
                className={inputCls}
                aria-label="WebGL renderer"
              >
                {(WEBGL_RENDERERS_BY_VENDOR[form.webgl_vendor] ?? []).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
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
            {
              value: 'based_on_webgl',
              label: 'Based on WebGL',
              tip: 'Mirror the WebGL vendor/renderer to WebGPU — the most consistent default'
            },
            {
              value: 'real',
              label: 'Real',
              tip: 'Expose the host machine’s actual WebGPU adapter (less spoofed but never mismatches WebGL)'
            },
            {
              value: 'disabled',
              label: 'Disabled',
              tip: 'Block WebGPU entirely — sites can detect this but can’t fingerprint your GPU'
            }
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
            Per-profile hardware-fingerprint protection. Canvas, WebGL Image, AudioContext and
            ClientRects report stable, consistent values that pass pixelscan / browserscan checks.
            Media device and SpeechVoices are unique per profile (device-ID salt / locale voices).
          </span>
        </div>
      </Row>
    </>
  )
}
