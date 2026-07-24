// Form-field rendering for the Proxy tab. Pure presentational; the
// stateful logic + Save/Test buttons live in ProxyCard.tsx.

import * as React from 'react'
import { Field } from './parts'

export type ProxyType = 'http' | 'https' | 'socks5'

export interface ProxyFieldsState {
  type: ProxyType
  host: string
  port: string
  user: string
  pass: string
}

const inputCls =
  'w-full px-2.5 py-1.5 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-md text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30'

export function ProxyCardFields({
  form,
  disabled,
  onChange
}: {
  form: ProxyFieldsState
  disabled: boolean
  onChange: (patch: Partial<ProxyFieldsState>) => void
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <Field label="Type">
        <div className="flex gap-1.5">
          {(['http', 'https', 'socks5'] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ type: t })}
              className={
                'px-3 py-1 text-xs font-semibold rounded-md transition-colors ' +
                (form.type === t
                  ? 'bg-[var(--red)] text-white'
                  : 'bg-[var(--panel-2)] text-[var(--t2)] hover:bg-[var(--hover)]')
              }
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Host">
            <input
              type="text"
              value={form.host}
              onChange={(e) => onChange({ host: e.target.value })}
              placeholder="proxy.example.com"
              disabled={disabled}
              className={inputCls + ' mono'}
            />
          </Field>
        </div>
        <Field label="Port">
          <input
            type="number"
            value={form.port}
            onChange={(e) => onChange({ port: e.target.value })}
            placeholder="8080"
            min={1}
            max={65535}
            disabled={disabled}
            className={inputCls + ' mono'}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Username (optional)">
          <input
            type="text"
            value={form.user}
            onChange={(e) => onChange({ user: e.target.value })}
            autoComplete="off"
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="Password (optional)">
          <input
            type="password"
            value={form.pass}
            onChange={(e) => onChange({ pass: e.target.value })}
            autoComplete="new-password"
            disabled={disabled}
            className={inputCls}
          />
        </Field>
      </div>
    </div>
  )
}
