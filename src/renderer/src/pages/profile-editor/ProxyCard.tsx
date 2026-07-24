// Per-profile proxy editor. Two modes — "pool" (workspace-pool picker)
// and "custom" (inline fields). Both write to profile.proxy_* columns;
// save is independent of the General-tab save (matches CookiesCard).

import * as React from 'react'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Section } from './parts'
import { useDirtyGuard, useRegisterSaver } from './DirtyContext'
import {
  assignProxyToProfile,
  clearProfileProxy,
  type ProfileRow
} from '@/lib/profiles'
import type { ProxyRow } from '@/lib/proxies'
import { ProxyPicker } from './ProxyPicker'
import { ProxyCustomMode } from './ProxyCustomMode'
import { useProxyCustom } from './useProxyCustom'

type Mode = 'pool' | 'custom'

export function ProxyCard({
  profile,
  canEdit,
  onSaved
}: {
  profile: ProfileRow
  canEdit: boolean
  onSaved?: (p: ProfileRow) => void
}): React.ReactElement {
  const [mode, setMode] = useState<Mode>('pool')
  const [error, setError] = useState<string | null>(null)
  const [poolSaving, setPoolSaving] = useState(false)

  const custom = useProxyCustom(profile, setError)
  // Custom mode is the only one with a "dirty" notion (form vs row).
  // Pool mode picks one and saves immediately; never partially-edited.
  useDirtyGuard('Proxy', mode === 'custom' && custom.dirty)
  // Top-right Save flushes pending custom-mode edits too. Skips when
  // user is on pool mode (no batched state) or nothing has changed.
  useRegisterSaver('Proxy', async () => {
    if (mode !== 'custom' || !custom.dirty) return { ok: true }
    const r = await custom.saveCustom()
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  })

  const onPickFromPool = async (p: ProxyRow): Promise<void> => {
    setPoolSaving(true)
    setError(null)
    try {
      const updated = await assignProxyToProfile(profile.id, {
        id: p.id,
        proxy_type: p.proxy_type,
        host: p.host,
        port: p.port,
        username: p.username,
        password_encrypted: p.password_encrypted,
        source: p.source,
        tubeproxies_ip_id: p.tubeproxies_ip_id
      })
      onSaved?.(updated)
      custom.clearTestResult()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPoolSaving(false)
    }
  }

  const onSaveCustom = async (): Promise<void> => {
    const r = await custom.saveCustom()
    if (r.ok && r.row) onSaved?.(r.row)
  }

  const onClear = async (): Promise<void> => {
    if (!confirm('Remove the proxy from this profile?')) return
    setPoolSaving(true)
    setError(null)
    try {
      const updated = await clearProfileProxy(profile.id)
      onSaved?.(updated)
      custom.clearTestResult()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPoolSaving(false)
    }
  }

  const hasAssigned = !!profile.proxy_host
  const saving = poolSaving || custom.saving
  const fieldsDisabled = !canEdit || saving

  return (
    <Section
      title="Proxy"
      subtitle={
        <span className="text-xs">
          Proxy auth is forwarded automatically — no per-launch dialog.
        </span>
      }
      action={
        canEdit && hasAssigned ? (
          <button
            onClick={() => void onClear()}
            disabled={saving}
            className="px-2.5 py-1 text-xs font-medium border border-[var(--line)] rounded-md text-[var(--t2)] hover:text-[var(--red)] hover:border-red-200 dark:hover:border-red-900/50 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </button>
        ) : null
      }
    >
      {error && (
        <div className="mb-3 px-3 py-2 text-xs bg-[var(--red-soft)] text-[var(--red)] rounded-md">
          {error}
        </div>
      )}

      {hasAssigned && (
        <div className="mb-4 px-3 py-2.5 bg-[var(--panel-2)] rounded-md text-xs">
          <div className="text-[var(--t3)] uppercase font-semibold tracking-wider mb-0.5">
            Currently assigned
          </div>
          <div className="mono text-[var(--t1)]">
            {profile.proxy_type?.toUpperCase()} · {profile.proxy_host}:{profile.proxy_port}
            {profile.proxy_user && <> · auth as {profile.proxy_user}</>}
          </div>
        </div>
      )}

      <div className="mb-4 inline-flex p-0.5 bg-brand-cream/60 dark:bg-night-base rounded-md">
        {(['pool', 'custom'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              'px-3 py-1 text-xs font-semibold rounded transition-colors ' +
              (mode === m
                ? 'bg-[var(--red)] text-white shadow-sm'
                : 'text-[var(--t3)] hover:text-[var(--t1)] dark:hover:text-night-text')
            }
          >
            {m === 'pool' ? 'From workspace pool' : 'Custom inline'}
          </button>
        ))}
      </div>

      {mode === 'pool' && (
        <ProxyPicker
          currentProxyHost={profile.proxy_host}
          currentProxyPort={profile.proxy_port}
          onPick={(p) => void onPickFromPool(p)}
          disabled={fieldsDisabled}
        />
      )}

      {mode === 'custom' && (
        <ProxyCustomMode
          form={custom.form}
          setForm={custom.setForm}
          canEdit={canEdit}
          saving={saving}
          testing={custom.testing}
          dirty={custom.dirty}
          valid={custom.valid}
          hasHost={custom.hasHost}
          testResult={custom.testResult}
          onTest={() => void custom.test()}
          onSave={() => void onSaveCustom()}
        />
      )}
    </Section>
  )
}
