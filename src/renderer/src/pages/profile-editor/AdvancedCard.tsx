// Per-profile advanced settings — matches the DS ProfileEditor "Advanced"
// card exactly: one .ecard with .fp-row fields (DNT / HW accel / TLS / random /
// launch args) plus Cookies as a row inside the same card. Every input maps to
// a column added in migration 0008 (+ cookies_json).

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Button, Toggle } from '@/components/ui'
import { useDirtyGuard, useRegisterSaver, type SaveResult } from './DirtyContext'
import { updateProfile, type ProfileRow } from '@/lib/profiles'
import { inspectCookiesJson } from '../../../../shared/cookies'

type Tri = 'default' | 'open' | 'close'
interface Form {
  do_not_track: Tri
  hardware_acceleration: Tri
  disable_tls_features: boolean
  launch_args: string
  random_fingerprint_on_startup: boolean
  cookies_json: string
}

function rowToForm(p: ProfileRow): Form {
  return {
    do_not_track: (p.do_not_track as Tri) ?? 'default',
    hardware_acceleration: (p.hardware_acceleration as Tri) ?? 'default',
    disable_tls_features: p.disable_tls_features ?? false,
    launch_args: p.launch_args ?? '',
    random_fingerprint_on_startup: p.random_fingerprint_on_startup ?? false,
    cookies_json: p.cookies_json ?? ''
  }
}

const TRISTATE: { value: Tri; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'open', label: 'Open' },
  { value: 'close', label: 'Close' }
]

// DS segmented control (.seg / .seg-opt).
function Seg({ value, onChange }: { value: Tri; onChange: (v: Tri) => void }): React.ReactElement {
  return (
    <div className="seg">
      {TRISTATE.map((o) => (
        <button key={o.value} className={'seg-opt' + (value === o.value ? ' on' : '')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function AdvancedCard({
  profile,
  onSaved
}: {
  profile: ProfileRow
  onSaved?: (p: ProfileRow) => void
}): React.ReactElement {
  const [form, setForm] = useState<Form>(() => rowToForm(profile))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setForm(rowToForm(profile)), [profile])

  const dirty = JSON.stringify(form) !== JSON.stringify(rowToForm(profile))
  useDirtyGuard('Advanced', dirty)
  const update = (patch: Partial<Form>): void => setForm((f) => ({ ...f, ...patch }))

  // Cookie count / error shown in the DS .cookie-hint (empty → format hint).
  const insp = useMemo(() => inspectCookiesJson(form.cookies_json), [form.cookies_json])
  const cookieHint = !form.cookies_json.trim()
    ? 'JSON or Netscape format'
    : insp.ok
      ? `${insp.total} cookies detected`
      : insp.error

  const persist = async (): Promise<SaveResult & { row?: ProfileRow }> => {
    if (!dirty) return { ok: true }
    try {
      const r = await updateProfile(profile.id, {
        do_not_track: form.do_not_track,
        hardware_acceleration: form.hardware_acceleration,
        disable_tls_features: form.disable_tls_features,
        launch_args: form.launch_args || null,
        random_fingerprint_on_startup: form.random_fingerprint_on_startup,
        cookies_json: form.cookies_json.trim() ? form.cookies_json : null
      })
      return { ok: true, row: r }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  useRegisterSaver('Advanced', async () => {
    const r = await persist()
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  })

  const onSave = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    const r = await persist()
    setSaving(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    if (r.row) onSaved?.(r.row)
  }

  return (
    <div className="ecard">
      <div className="ecard-head">
        <div>
          <div className="ecard-title">Advanced</div>
          <div className="ecard-sub" style={{ fontFamily: 'var(--sans)' }}>
            Power-user settings · changes apply on next launch
          </div>
        </div>
        <div className="ecard-actions">
          <Button variant="primary" size="sm" icon={<Check size={15} />} onClick={onSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {error && <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--red)' }}>{error}</div>}

      <div className="fp-row">
        <div className="fp-row-l">Do Not Track</div>
        <div className="fp-row-c">
          <Seg value={form.do_not_track} onChange={(v) => update({ do_not_track: v })} />
        </div>
      </div>
      <div className="fp-row">
        <div className="fp-row-l">Hardware acceleration</div>
        <div className="fp-row-c">
          <Seg value={form.hardware_acceleration} onChange={(v) => update({ hardware_acceleration: v })} />
        </div>
      </div>
      <div className="fp-row">
        <div className="fp-row-l">TLS features</div>
        <div className="fp-row-c">
          <div className="hw-tog">
            <Toggle checked={form.disable_tls_features} onChange={(v) => update({ disable_tls_features: v })} />
            Disable TLS features
          </div>
        </div>
      </div>
      <div className="fp-row">
        <div className="fp-row-l">Random on startup</div>
        <div className="fp-row-c">
          <div className="hw-tog">
            <Toggle
              checked={form.random_fingerprint_on_startup}
              onChange={(v) => update({ random_fingerprint_on_startup: v })}
            />
            Generate a new fingerprint on every launch (overrides saved values)
          </div>
        </div>
      </div>
      <div className="fp-row">
        <div className="fp-row-l">Launch args</div>
        <div className="fp-row-c">
          <textarea
            className="inp mono-area"
            style={{ minHeight: '92px' }}
            value={form.launch_args}
            onChange={(e) => update({ launch_args: e.target.value })}
            placeholder={'Extra Chromium args, one per line. e.g.\n--disable-notifications\n--blink-settings=imagesEnabled=false'}
            spellCheck={false}
          />
        </div>
      </div>
      <div className="fp-row">
        <div className="fp-row-l">Cookies</div>
        <div className="fp-row-c">
          <div className="cookie-field">
            <textarea
              className="inp mono-area"
              style={{ minHeight: '110px' }}
              value={form.cookies_json}
              onChange={(e) => update({ cookies_json: e.target.value })}
              placeholder="Paste cookies as JSON or Netscape format to import into this profile…"
              spellCheck={false}
            />
            <div className="cookie-foot">
              <span className="cookie-hint">{cookieHint}</span>
              <Button size="sm" icon={<Plus size={14} />} onClick={onSave}>
                Merge cookies
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
