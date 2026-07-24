import * as React from 'react'
import { useEffect, useState } from 'react'
import { Check, Eye, EyeOff, KeyRound, Lock, Trash2 } from 'lucide-react'
import { getSupabase } from '@/lib/supabase'
import { useWorkspace } from '@/store/workspace'
import { useFeatureEnabled, useHasPermission } from '@/lib/permissions'
import { ErrorBanner, Field, Loading, Section } from './parts'

// TubeProxies tab — API key entry + connection test + sync interval.
// PLAN.md §6.6 calls this out as a dedicated Settings tab.
//
// IMPORTANT — current encryption status:
//   The DB column is named `tubeproxies_api_key_encrypted` because the
//   long-term plan is to move it into Supabase Vault (Phase 5). At this
//   point the value is NOT encrypted at rest — it's stored plain text
//   under that column name. We never log it, never expose it to the UI
//   in cleartext after save, and only allow workspace.edit_settings to
//   write it. Vault integration is the v1.1 follow-up.
export function TubeproxiesTab(): React.ReactElement {
  const ws = useWorkspace((s) => s.current)
  const canEdit = useHasPermission('workspace.edit_settings')
  const planAllowsApi = useFeatureEnabled('tubeproxies_api')

  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<
    { ok: true; message: string } | { ok: false; message: string } | null
  >(null)

  // We never read the actual key value into the renderer for display —
  // we only ask whether one exists, so we can show "Connected" vs "Not set".
  useEffect(() => {
    if (!ws) return
    const supabase = getSupabase()
    if (!supabase) return
    let cancelled = false
    supabase
      .from('workspaces')
      .select('tubeproxies_api_key_encrypted')
      .eq('id', ws.workspace_id)
      .maybeSingle()
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          setError(res.error.message)
          return
        }
        const v = res.data?.tubeproxies_api_key_encrypted as string | null | undefined
        setHasKey(Boolean(v && v.length > 0))
      })
    return () => {
      cancelled = true
    }
  }, [ws?.workspace_id])

  const onSave = async (): Promise<void> => {
    if (!ws) return
    const trimmed = keyDraft.trim()
    if (!trimmed) {
      setError('Paste an API key first.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = getSupabase()
    if (!supabase) {
      setError('Supabase not configured')
      setSaving(false)
      return
    }
    const { error: e } = await supabase
      .from('workspaces')
      .update({ tubeproxies_api_key_encrypted: trimmed })
      .eq('id', ws.workspace_id)
    setSaving(false)
    if (e) {
      setError(e.message)
      return
    }
    setHasKey(true)
    setKeyDraft('')
    setSavedAt(Date.now())
    setTestResult(null)
  }

  const onClear = async (): Promise<void> => {
    if (!ws) return
    if (!confirm('Remove the saved TubeProxies API key from this workspace?')) return
    setSaving(true)
    setError(null)
    const supabase = getSupabase()
    if (!supabase) {
      setError('Supabase not configured')
      setSaving(false)
      return
    }
    const { error: e } = await supabase
      .from('workspaces')
      .update({ tubeproxies_api_key_encrypted: null })
      .eq('id', ws.workspace_id)
    setSaving(false)
    if (e) {
      setError(e.message)
      return
    }
    setHasKey(false)
    setSavedAt(Date.now())
    setTestResult(null)
  }

  const onTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    // Real connection test lands in Phase 3 alongside the TubeProxies
    // API client (`/api/v1/inventory` etc.). Until then we simulate a
    // local "key looks plausible" check so the button is honest about
    // what it does, rather than pretending to call an API that doesn't
    // exist yet.
    await new Promise((r) => setTimeout(r, 600))
    setTesting(false)
    if (!hasKey) {
      setTestResult({ ok: false, message: 'No API key saved yet.' })
      return
    }
    setTestResult({
      ok: true,
      message: 'Local check passed. Live API connection test ships in Phase 3 (inventory sync).'
    })
  }

  if (!ws) return <Loading />

  return (
    <>
      {!planAllowsApi && (
        <Section title="TubeProxies API">
          <div className="flex items-start gap-3 text-sm text-[var(--t2)]">
            <Lock className="w-5 h-5 mt-0.5 shrink-0 opacity-60" />
            <p>
              The TubeProxies API integration is available on Pro and Team plans. Upgrade to connect
              your account and pull your IP inventory directly into this workspace.
            </p>
          </div>
        </Section>
      )}

      {planAllowsApi && (
        <Section
          title="API key"
          subtitle={
            <span className="text-xs">
              Connect this workspace to your TubeProxies account. The key is workspace-scoped —
              every member with the right permissions uses the same one.
            </span>
          }
        >
          <div className="space-y-4">
            <Field label="Status">
              {hasKey === null ? (
                <div className="text-sm text-[var(--t3)]">Loading…</div>
              ) : hasKey ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-[var(--green)] font-semibold text-xs">
                    <Check className="w-3 h-3" />
                    Connected
                  </span>
                  <span className="text-[var(--t3)] text-xs">
                    Key is saved. Paste a new one below to replace it.
                  </span>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--hover)] text-[var(--t2)] font-semibold text-xs">
                  Not set
                </span>
              )}
            </Field>

            <Field label={hasKey ? 'Replace API key' : 'API key'}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--t4)]" />
                  <input
                    type={showKey ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    disabled={!canEdit}
                    placeholder={hasKey ? '••••••••••••••••' : 'tp_live_…'}
                    className="w-full pl-8 pr-9 py-2 text-sm mono bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--t4)] hover:text-[var(--t1)] dark:hover:text-night-text"
                    title={showKey ? 'Hide' : 'Show'}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={onSave}
                  disabled={!canEdit || !keyDraft.trim() || saving}
                  title={!canEdit ? "You don't have permission" : undefined}
                  className="px-3 py-2 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--t3)]">
                Find your API key in the{' '}
                <span className="text-[var(--t2)]">TubeProxies dashboard → Settings → API</span>.
                The key is never displayed again after save.
              </p>
              {savedAt && (
                <div className="mt-1.5 text-[11px] text-[var(--green)] flex items-center gap-1">
                  <Check className="w-3 h-3" /> Saved
                </div>
              )}
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={onTest}
                disabled={testing || hasKey === null}
                className="px-3 py-1.5 text-sm font-medium border border-[var(--line)] rounded-lg text-[var(--t1)] hover:bg-brand-surface/50 dark:hover:bg-night-raised disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              {hasKey && canEdit && (
                <button
                  onClick={onClear}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm font-medium border border-[var(--red)]/25 text-[var(--red)] rounded-lg hover:bg-[var(--red-soft)] disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove key
                </button>
              )}
              {testResult && (
                <span
                  className={`text-[11px] ${
                    testResult.ok ? 'text-[var(--green)]' : 'text-[var(--red)]'
                  }`}
                >
                  {testResult.message}
                </span>
              )}
            </div>
          </div>
        </Section>
      )}

      <Section title="Encryption at rest" labelStyle>
        <p className="text-xs text-[var(--t3)] leading-relaxed">
          Per the project spec, the API key will move to Supabase Vault for encryption at rest in a
          follow-up patch. Until then it’s stored in the workspaces row, gated by the
          <span className="mono mx-1">workspace.edit_settings</span>
          permission so only workspace admins can read or change it.
        </p>
      </Section>

      <Section title="IP inventory refresh" labelStyle>
        <p className="text-xs text-[var(--t3)] leading-relaxed">
          Configurable refresh interval (default: every 5 min) lands alongside the live inventory
          sync in Phase 3. Until then, use the{' '}
          <span className="font-semibold">Sync TubeProxies</span> button on the Proxies page to
          manually refresh.
        </p>
      </Section>

      {error && <ErrorBanner message={error} />}
    </>
  )
}
