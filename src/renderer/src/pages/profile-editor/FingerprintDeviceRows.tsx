// Device rows of the fingerprint form.
//
// Split from FingerprintFields to keep each file reviewable. Every group takes
// the same (form, update) pair, so they compose into one form without any
// group owning state.

import * as React from 'react'
import { Row, Seg } from './seg'
import { browserVersionsFor, osVersionsFor } from './randomize'
import { inputCls, type Form } from './fingerprintFields.types'

export function FingerprintDeviceRows({
  form,
  update,
  engineAction
}: {
  form: Form
  update: (patch: Partial<Form>) => void
  engineAction?: React.ReactNode
}): React.ReactElement {
  return (
    <>
      <Row label="Platform">
        <Seg
          value={form.platform as 'windows' | 'macos' | 'linux'}
          // Linux is intentionally hidden from the UI — niche and often flagged.
          // The 'linux' value stays valid in the type so existing Linux profiles
          // still load; it's just not selectable here.
          options={[
            {
              value: 'windows',
              label: 'Windows',
              tip: 'Spoof Windows 10/11 — most common desktop fingerprint'
            },
            {
              value: 'macos',
              label: 'macOS',
              tip: 'Spoof macOS — pairs with Apple GPU vendor only'
            }
          ]}
          onChange={(v) => update({ platform: v })}
        />
      </Row>
      <Row label="OS version">
        <select
          value={form.platform_version}
          onChange={(e) => update({ platform_version: e.target.value })}
          className={inputCls}
        >
          {osVersionsFor(form.platform).map((o) => (
            <option key={o.label} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Browser version">
        <div className="flex items-center gap-2">
          <select
            value={form.brand_version_major}
            onChange={(e) => update({ brand_version_major: e.target.value })}
            className={`${inputCls} flex-1 min-w-0`}
          >
            {browserVersionsFor(form.platform).map((v) => (
              <option key={v} value={v}>
                Chromium {v}
              </option>
            ))}
          </select>
          {engineAction}
        </div>
      </Row>
      <Row label="User-Agent">
        <textarea
          rows={2}
          value={form.user_agent}
          onChange={(e) => update({ user_agent: e.target.value })}
          placeholder="Auto-derived if blank"
          className={`${inputCls} resize-none mono text-[10px]`}
        />
      </Row>

      <Row label="WebRTC">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.webrtc_mode}
            options={[
              {
                value: 'forward',
                label: 'Forward',
                tip: 'Drop public-IP ICE candidates so sites only see the proxy IP via WebRTC — recommended for Google/YouTube'
              },
              {
                value: 'replace',
                label: 'Replace',
                tip: 'Rewrite every public IP in WebRTC candidates to the proxy IP — same goal as Forward, friendlier to sites that require an IP candidate'
              },
              {
                value: 'real',
                label: 'Real',
                tip: 'Expose the host’s real IP via WebRTC — only safe with no proxy or full trust'
              },
              {
                value: 'disabled',
                label: 'Disabled',
                tip: 'Block WebRTC entirely — breaks video calls + voice but eliminates IP leaks'
              },
              {
                value: 'proxy_udp',
                label: 'Proxy UDP',
                tip: 'Tunnel WebRTC UDP through the proxy. Engine support v1.1 (needs SOCKS5-UDP).'
              }
            ]}
            onChange={(v) => update({ webrtc_mode: v })}
          />
          {form.webrtc_mode === 'proxy_udp' && (
            <span className="text-[10px] text-[var(--t4)]">
              <b>Proxy UDP</b> saves now but doesn’t apply yet — needs SOCKS5 UDP tunneling (v1.1).
              For most users, <b>Forward</b> achieves the same goal.
            </span>
          )}
        </div>
      </Row>
    </>
  )
}
