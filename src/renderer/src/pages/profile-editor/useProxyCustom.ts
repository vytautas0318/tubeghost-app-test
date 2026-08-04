// Custom-inline-mode hook for ProxyCard. Owns the form state, port
// validation, save-to-profile, and test-via-IPC flow. Pure logic — no
// JSX. Lifted out of ProxyCard.tsx so the file stays under the size cap.

import { useEffect, useMemo, useState } from 'react'
import { updateProfile, type ProfileRow } from '@/lib/profiles'
import { testProxy } from '@/lib/proxy-test'
import type { SaveResult } from './DirtyContext'
import type { ProxyFieldsState, ProxyType } from './ProxyCardFields'
import type { TestResult } from './ProxyCustomMode'

function rowToForm(p: ProfileRow): ProxyFieldsState {
  return {
    type: (p.proxy_type as ProxyType) ?? 'http',
    host: p.proxy_host ?? '',
    port: p.proxy_port != null ? String(p.proxy_port) : '',
    user: p.proxy_user ?? '',
    pass: p.proxy_pass ?? ''
  }
}

export interface UseProxyCustomResult {
  form: ProxyFieldsState
  setForm: (next: ProxyFieldsState) => void
  dirty: boolean
  valid: boolean
  hasHost: boolean
  testResult: TestResult
  setTestResult: (t: TestResult) => void
  saving: boolean
  testing: boolean
  // Returns SaveResult so callers (per-card button + editor-wide Save)
  // can distinguish success from failure without re-reading the error
  // ref out of band. `row` carries the updated profile when ok.
  saveCustom: () => Promise<SaveResult & { row?: ProfileRow }>
  test: () => Promise<void>
  clearTestResult: () => void
}

export function useProxyCustom(
  profile: ProfileRow,
  setError: (m: string | null) => void
): UseProxyCustomResult {
  const [form, setForm] = useState<ProxyFieldsState>(() => rowToForm(profile))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setForm(rowToForm(profile)), [profile])

  const original = useMemo(() => rowToForm(profile), [profile])

  const dirty =
    form.type !== original.type ||
    form.host !== original.host ||
    form.port !== original.port ||
    form.user !== original.user ||
    form.pass !== original.pass

  const portParsed = (): number | undefined | null => {
    if (form.port.trim() === '') return undefined
    const n = Number(form.port)
    if (!Number.isFinite(n) || n < 1 || n > 65535) return null
    return n
  }

  const valid = (() => {
    const host = form.host.trim()
    const p = portParsed()
    if (!host && p === undefined) return true
    if (!host || p === undefined) return false
    return p !== null
  })()

  const saveCustom = async (): Promise<SaveResult & { row?: ProfileRow }> => {
    if (!valid) {
      const msg = 'Port must be 1–65535'
      setError(msg)
      return { ok: false, error: msg }
    }
    setSaving(true)
    setError(null)
    try {
      const host = form.host.trim()
      const p = portParsed()
      const updated = await updateProfile(profile.id, {
        proxy_type: host ? form.type : null,
        proxy_host: host || null,
        proxy_port: typeof p === 'number' ? p : null,
        proxy_user: form.user.trim() || null,
        proxy_pass: form.pass || null,
        proxy_source: 'custom_inline',
        // Inline credentials replace any pool assignment — release the FK
        // so the previously-picked pool proxy counts as unused again.
        proxy_id: null,
        tubeproxies_ip_id: null
      })
      setTestResult(null)
      return { ok: true, row: updated }
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      return { ok: false, error: msg }
    } finally {
      setSaving(false)
    }
  }

  const test = async (): Promise<void> => {
    if (!valid || !form.host.trim()) {
      setError('Fill host + port before testing')
      return
    }
    setTesting(true)
    setError(null)
    setTestResult(null)
    try {
      const p = portParsed()
      if (typeof p !== 'number') {
        setTestResult({ ok: false, reason: 'Invalid port' })
        return
      }
      const r = await testProxy({
        proxy_type: form.type,
        host: form.host.trim(),
        port: p,
        username: form.user.trim() || null,
        password: form.pass || null,
        expected_egress_ip: profile.last_known_egress_ip
      })
      if (r.ok) {
        setTestResult({ ok: true, egress: r.egress_ip, ms: r.elapsed_ms })
      } else {
        setTestResult({ ok: false, reason: `${r.stage ?? 'unknown'}: ${r.error ?? 'failed'}` })
      }
    } catch (e) {
      setTestResult({ ok: false, reason: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  return {
    form,
    setForm,
    dirty,
    valid,
    hasHost: !!form.host.trim(),
    testResult,
    setTestResult,
    saving,
    testing,
    saveCustom,
    test,
    clearTestResult: () => setTestResult(null)
  }
}
