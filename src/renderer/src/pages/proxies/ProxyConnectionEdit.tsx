// Connection editor for a CUSTOM proxy: protocol, host, port, credentials.
//
// Unlike the label/notes fields (which save per-field), this saves the whole
// connection as ONE unit — host and port are a pair, and committing them
// separately would leave the proxy pointing at a host:port combination that
// never existed. A single Save also means one re-sync of the assigned
// profiles instead of four.
//
// Purchased proxies never reach this component; their connection data is
// TubeProxies-owned (see canEditType in ProxyDetailDrawer).

import * as React from 'react'
import { useState } from 'react'
import { DrawerSection } from './drawer-parts'
import type { ProxyType } from '@/lib/proxies'
import { validateDraft, type ConnectionDraft } from './connectionDraft'

// The DB check constraint allows exactly these three; 'wireguard' exists in
// the TS union but has no ghost.proxies representation.
const TYPE_OPTIONS: { value: ProxyType; label: string }[] = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'socks5', label: 'SOCKS5' }
]

const fieldCls =
  'w-full px-3 py-1.5 text-sm bg-[var(--panel)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30'
const lblCls = 'block text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)] mb-1'

export function ProxyConnectionEdit({
  draft,
  dirty,
  saving,
  profileCount,
  onChange,
  onSave
}: {
  draft: ConnectionDraft
  dirty: boolean
  saving: boolean
  profileCount: number
  onChange: (d: ConnectionDraft) => void
  onSave: () => void
}): React.ReactElement {
  const [showPassword, setShowPassword] = useState(false)
  const error = dirty ? validateDraft(draft) : null
  const set = (patch: Partial<ConnectionDraft>): void => onChange({ ...draft, ...patch })

  return (
    <DrawerSection title="Connection">
      <div className="space-y-3">
        <div>
          <label className={lblCls}>Protocol</label>
          <select
            value={draft.proxy_type}
            onChange={(e) => set({ proxy_type: e.target.value as ProxyType })}
            className={fieldCls}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <label className={lblCls}>Host</label>
            <input
              type="text"
              value={draft.host}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => set({ host: e.target.value })}
              className={fieldCls}
            />
          </div>
          <div className="w-24 shrink-0">
            <label className={lblCls}>Port</label>
            <input
              type="text"
              inputMode="numeric"
              value={draft.port}
              onChange={(e) => set({ port: e.target.value })}
              className={fieldCls}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <label className={lblCls}>Username</label>
            <input
              type="text"
              value={draft.username}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => set({ username: e.target.value })}
              className={fieldCls}
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className={lblCls}>Password</label>
            <div className="flex gap-1">
              <input
                type={showPassword ? 'text' : 'password'}
                value={draft.password}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => set({ password: e.target.value })}
                className={fieldCls}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="shrink-0 px-2 text-[var(--t3)] hover:text-[var(--t1)]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        {error && <p className="text-[11px] text-[var(--red)]">{error}</p>}

        <p className="text-[11px] text-[var(--t3)]">
          Re-test the connection after saving — a wrong protocol or port fails as &ldquo;IP check
          failed&rdquo; at launch.
          {profileCount > 0 && (
            <>
              {' '}
              {profileCount} {profileCount === 1 ? 'profile uses' : 'profiles use'} this proxy and
              will be updated too.
            </>
          )}
        </p>

        {dirty && (
          <div className="flex justify-end">
            <button
              onClick={onSave}
              disabled={saving || error !== null}
              className="px-3 py-1.5 text-xs font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save connection'}
            </button>
          </div>
        )}
      </div>
    </DrawerSection>
  )
}
