// Live "what does this profile actually look like" panel. Reads from
// the in-progress fingerprint form (NOT the saved row) so users see
// their pending changes resolved before clicking Save.
//
// Mode-aware: if Timezone is "Based on IP", we display "Based on IP"
// rather than the stored value (which is unused in that mode).

import * as React from 'react'
import { Section } from './parts'

type Mode3 = 'real' | 'based_on_ip' | 'custom'
type WebRtcMode = 'forward' | 'replace' | 'real' | 'disabled' | 'proxy_udp'
type WebGpuMode = 'based_on_webgl' | 'real' | 'disabled'

export interface OverviewState {
  fingerprint_seed: number
  platform: string
  brand: string
  brand_version_major: string
  user_agent: string
  hardware_concurrency: number | ''
  device_memory: number | ''
  cpu_mode?: 'real' | 'custom'
  ram_mode?: 'real' | 'custom'
  // 'real' → report the host GPU (sidebar shows "Real (host GPU)" and
  // the vendor/renderer strings below are ignored). 'custom' → show the
  // spoofed strings. Optional for backward compat with any caller that
  // hasn't wired it through yet.
  webgl_mode?: 'real' | 'custom'
  webgl_vendor: string
  webgl_renderer: string
  webgpu_mode: WebGpuMode
  screen_resolution: string
  timezone_mode: Mode3
  timezone: string
  language_mode: Mode3
  language: string
  webrtc_mode: WebRtcMode
  noise_canvas: boolean
  noise_webgl_image: boolean
  noise_audiocontext: boolean
  noise_media_device: boolean
  noise_clientrects: boolean
  noise_speechvoices: boolean
}

const WEBRTC_LABEL: Record<WebRtcMode, string> = {
  forward: 'Forward',
  replace: 'Replace',
  real: 'Real',
  disabled: 'Disabled',
  proxy_udp: 'Proxy UDP'
}

function modeValue(mode: Mode3, custom: string): string {
  if (mode === 'real') return 'Real'
  if (mode === 'based_on_ip') return 'Based on IP'
  return custom || '—'
}

export function OverviewSidebar({ state }: { state: OverviewState | null }): React.ReactElement {
  if (!state) {
    return (
      <Section title="Overview">
        <div className="text-xs text-[var(--t3)]">Loading…</div>
      </Section>
    )
  }

  const webgpuLabel =
    state.webgpu_mode === 'based_on_webgl'
      ? 'Based on WebGL'
      : state.webgpu_mode === 'real'
        ? 'Real'
        : 'Disabled'
  const rows: Array<[string, React.ReactNode]> = [
    [
      'Browser',
      `${state.brand}${state.brand_version_major ? ` ${state.brand_version_major}` : ''}`
    ],
    ['Platform', state.platform],
    ['User-Agent', state.user_agent || 'Auto-derived'],
    ['WebRTC', WEBRTC_LABEL[state.webrtc_mode]],
    ['Timezone', modeValue(state.timezone_mode, state.timezone)],
    ['Language', modeValue(state.language_mode, state.language)],
    ['Screen Resolution', state.screen_resolution || '—'],
    [
      'CPU cores',
      state.cpu_mode === 'real'
        ? 'Real'
        : state.hardware_concurrency === ''
          ? '—'
          : String(state.hardware_concurrency)
    ],
    [
      'RAM',
      state.ram_mode === 'real'
        ? 'Real'
        : state.device_memory === ''
          ? '—'
          : `${state.device_memory} GB`
    ],
    ['WebGL vendor', state.webgl_mode === 'real' ? 'Real (host GPU)' : state.webgl_vendor || '—'],
    [
      'WebGL renderer',
      state.webgl_mode === 'real' ? 'Real (host GPU)' : state.webgl_renderer || '—'
    ],
    ['WebGPU', webgpuLabel],
    // These rows reflect the (interactive) per-profile toggles. NOTE: for Canvas
    // / WebGL Image / AudioContext / ClientRects the toggle is COSMETIC — the
    // engine always reports REAL values for those four (flag-builder kill-switches
    // + audio.disable), because any perturbation of these hardware fingerprints is
    // detectable (browserscan "modified manually"). So "Noise" here means only
    // "the toggle is on", not that the browser actually noises that surface.
    ['Canvas', state.noise_canvas ? 'Noise' : 'Real'],
    ['WebGL Image', state.noise_webgl_image ? 'Noise' : 'Real'],
    ['AudioContext', state.noise_audiocontext ? 'Noise' : 'Real'],
    ['Media device', state.noise_media_device ? 'Noise' : 'Real'],
    ['ClientRects', state.noise_clientrects ? 'Noise' : 'Real'],
    ['SpeechVoices', state.noise_speechvoices ? 'Noise' : 'Real']
  ]

  return (
    <Section
      title="Overview"
      subtitle={<span className="mono text-[10px]">seed {state.fingerprint_seed}</span>}
    >
      <div className="space-y-1.5 text-[11px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <span className="text-[var(--t3)] shrink-0">{label}</span>
            <span
              className="text-[var(--t1)] text-right truncate min-w-0"
              title={typeof value === 'string' ? value : undefined}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}
