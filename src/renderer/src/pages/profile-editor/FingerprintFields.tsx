// The fingerprint field rows, shared by the profile editor and bulk create.
//
// Extracted from FingerprintCard so a batch can hand-tune ONE fingerprint for
// many profiles without duplicating ~650 lines of form. The rows depend only
// on `form` + `update` — no profile row, no save state — which is what makes
// them reusable: the editor saves them to a profile, bulk applies them as a
// base to every profile it creates.

import * as React from 'react'
import { useEffect, useState } from 'react'
import { Row, Seg } from './seg'
import { FingerprintDeviceRows } from './FingerprintDeviceRows'
import { FingerprintLocaleRows } from './FingerprintLocaleRows'
import { FingerprintHardwareRows } from './FingerprintHardwareRows'
import { inputCls, type Form } from './fingerprintFields.types'

export function FingerprintFields({
  form,
  update,
  engineAction
}: {
  form: Form
  update: (patch: Partial<Form>) => void
  // Install/refresh control for the selected engine build. Editor-only: a bulk
  // batch has no single profile to install for, so it passes nothing and the
  // row simply omits the action.
  engineAction?: React.ReactNode
}): React.ReactElement {
  // Device name / MAC / port-scan are saved-only power-user fields; hidden by
  // default so the common path stays short. The choice persists so a power
  // user toggles once rather than on every visit.
  const [showAdvanced, setShowAdvanced] = useState(() => {
    try {
      return localStorage.getItem('tpb.fp.showAdvanced') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('tpb.fp.showAdvanced', showAdvanced ? '1' : '0')
    } catch {
      /* private mode — the toggle still works, it just won't persist */
    }
  }, [showAdvanced])

  return (
    <>
      <FingerprintDeviceRows form={form} update={update} engineAction={engineAction} />
      <FingerprintLocaleRows form={form} update={update} />
      <FingerprintHardwareRows form={form} update={update} />

      {/* "Show advanced" toggle. Hides Device name / MAC / Port scan by
          default — saved-only power-user fields that add visual weight
          non-technical users don't need. */}
      <div className="my-3 border-t border-[var(--line)] pt-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-[11px] font-semibold text-[var(--t3)] hover:text-[var(--red)]"
        >
          {showAdvanced ? '− Hide advanced' : '+ Show advanced'}
        </button>
      </div>

      {showAdvanced && (
        <>
          <Row label="Device name">
            <div className="flex flex-col gap-1.5">
              <input
                type="text"
                value={form.device_name}
                onChange={(e) => update({ device_name: e.target.value })}
                placeholder="e.g. Akeem's MacBook Pro"
                className={inputCls}
              />
              <span className="text-[10px] text-[var(--t4)]">
                Cosmetic — saved with the profile. Browsers don’t expose hostname to web pages, so
                sites can’t fingerprint this directly. Useful for organizing your own profiles.
              </span>
            </div>
          </Row>

          <Row label="MAC Address">
            <div className="flex flex-col gap-1.5">
              <input
                type="text"
                value={form.mac_address}
                onChange={(e) => update({ mac_address: e.target.value })}
                placeholder="dc:2b:2a:1f:92:7a"
                className={`${inputCls} mono`}
              />
              <span className="text-[10px] text-[var(--t4)]">
                Saved for record-keeping. Browsers can’t read MAC addresses from JavaScript — this
                is here for parity with other anti-detect tools, not active spoofing.
              </span>
            </div>
          </Row>

          <Row label="Port scan protection">
            <div className="flex flex-col gap-1.5">
              <Seg
                value={form.port_scan_protection ? 'on' : 'off'}
                options={[
                  {
                    value: 'on',
                    label: 'Enable',
                    tip: 'Block sites from scanning your local network ports via private network access'
                  },
                  { value: 'off', label: 'Disable', tip: 'Allow normal Chrome behavior (default)' }
                ]}
                onChange={(v) => update({ port_scan_protection: v === 'on' })}
              />
              {form.port_scan_protection && (
                <input
                  type="text"
                  value={form.allowed_ports}
                  onChange={(e) => update({ allowed_ports: e.target.value })}
                  placeholder="Optional. Comma-separated ports to allow, e.g. 3000,8080"
                  className={`${inputCls} mono`}
                />
              )}
            </div>
          </Row>
        </>
      )}
    </>
  )
}
