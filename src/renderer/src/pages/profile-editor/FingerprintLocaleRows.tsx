// Locale rows of the fingerprint form.
//
// Split from FingerprintFields to keep each file reviewable. Every group takes
// the same (form, update) pair, so they compose into one form without any
// group owning state.

import * as React from 'react'
import { Row, Seg } from './seg'
import { TIMEZONE_OPTIONS } from './timezones'
import { inputCls, type Form } from './fingerprintFields.types'

export function FingerprintLocaleRows({
  form,
  update
}: {
  form: Form
  update: (patch: Partial<Form>) => void
}): React.ReactElement {
  return (
    <>
      <Row label="Timezone">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.timezone_mode}
            options={[
              { value: 'real', label: 'Real', tip: 'Use this machine’s actual timezone' },
              {
                value: 'based_on_ip',
                label: 'Based on IP',
                tip: 'Auto-derive from the proxy egress IP at every launch'
              },
              {
                value: 'custom',
                label: 'Custom',
                tip: 'Lock to a specific timezone you choose below'
              }
            ]}
            onChange={(v) => update({ timezone_mode: v })}
          />
          {form.timezone_mode === 'custom' && (
            <select
              value={form.timezone || ''}
              onChange={(e) => update({ timezone: e.target.value })}
              className={inputCls}
            >
              <option value="" disabled>
                Select a timezone…
              </option>
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </Row>
      <Row label="Language">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.language_mode}
            options={[
              {
                value: 'real',
                label: 'Real',
                tip: 'Use this machine’s actual language preference'
              },
              {
                value: 'based_on_ip',
                label: 'Based on IP',
                tip: 'Auto-derive from the proxy egress country at every launch'
              },
              {
                value: 'custom',
                label: 'Custom',
                tip: 'Lock to a specific BCP-47 language tag (e.g. en-US, fr-FR)'
              }
            ]}
            onChange={(v) => update({ language_mode: v })}
          />
          {form.language_mode === 'custom' && (
            <input
              type="text"
              value={form.language}
              onChange={(e) => update({ language: e.target.value })}
              className={inputCls}
            />
          )}
        </div>
      </Row>
      <Row label="Location">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.location_mode}
            options={[
              {
                value: 'real',
                label: 'Real',
                tip: 'Let the browser request the device’s real location (HTML5 geolocation)'
              },
              {
                value: 'based_on_ip',
                label: 'Based on IP',
                tip: 'Derive coordinates from the proxy egress IP — coarse but consistent with the rest of the fingerprint'
              },
              { value: 'custom', label: 'Custom', tip: 'Pin a specific lat/lon you choose below' },
              { value: 'block', label: 'Block', tip: 'Reject every getCurrentPosition() call' }
            ]}
            onChange={(v) => update({ location_mode: v })}
          />
          {form.location_mode === 'custom' && (
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={form.location_lat}
                onChange={(e) =>
                  update({ location_lat: e.target.value === '' ? '' : Number(e.target.value) })
                }
                className={inputCls}
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={form.location_lon}
                onChange={(e) =>
                  update({ location_lon: e.target.value === '' ? '' : Number(e.target.value) })
                }
                className={inputCls}
              />
            </div>
          )}
          {form.location_mode !== 'block' && (
            <Seg
              value={form.location_prompt}
              options={[
                {
                  value: 'ask',
                  label: 'Ask each time',
                  tip: 'Standard browser behavior: prompt on first request per site'
                },
                {
                  value: 'always_allow',
                  label: 'Always allow',
                  tip: 'Auto-grant the permission so sites never see a prompt'
                }
              ]}
              onChange={(v) => update({ location_prompt: v })}
            />
          )}
        </div>
      </Row>

      <Row label="Display language">
        <div className="flex flex-col gap-1.5">
          <Seg
            value={form.display_language_mode}
            options={[
              {
                value: 'based_on_language',
                label: 'Based on Language',
                tip: 'Mirror the Language setting above — the most common case'
              },
              { value: 'real', label: 'Real', tip: 'Use this machine’s actual UI language' },
              {
                value: 'custom',
                label: 'Custom',
                tip: 'Set a different display language than the navigator.language value'
              }
            ]}
            onChange={(v) => update({ display_language_mode: v })}
          />
          {form.display_language_mode === 'custom' && (
            <input
              type="text"
              value={form.display_language}
              onChange={(e) => update({ display_language: e.target.value })}
              placeholder="e.g. en-US"
              className={inputCls}
            />
          )}
        </div>
      </Row>
    </>
  )
}
