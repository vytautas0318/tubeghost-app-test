// Bulk profile creation page (replaces the /bulk Stub).
//
// Two flows:
//   1) Paste a CSV: name,tags,group_id (optional headers). One profile
//      per line.
//   2) Quick-create N profiles with a name template like "YT — {n}".
//
// Each created profile inherits all the safe-by-default fingerprint
// settings (createProfile already does that). Plan limit is enforced
// server-side by the enforce_profile_limit trigger; we surface
// per-row failures inline at the end.

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Plus } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { listProfiles, type ProfileRow } from '@/lib/profiles'
import { listProxies } from '@/lib/proxies'
import { ChevronLeft, Check } from 'lucide-react'
import { Button } from '@tubeghost/ui'
import { Tab } from './profile-editor/parts'
import { batchNames, type BatchSpec } from './bulk/batchSpec'
import { BatchTab, FingerprintTab } from './bulk/BulkTabs'
import { runBulkCreate } from './bulk/runBulkCreate'
import { useSharedFingerprint } from './bulk/useSharedFingerprint'

type Mode = 'batch' | 'fingerprint'

export function BulkCreate(): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const navigate = useNavigate()
  const canCreate = useHasPermission('profiles.create')

  // migrates in from a competitor, so it is deliberately kept.
  const [mode, setMode] = useState<Mode>('batch')
  const [spec, setSpec] = useState<BatchSpec>({
    prefix: 'Profile',
    start: 1,
    count: 10,
    platform: 'windows',
    groupId: null,
    proxyMode: 'pool',
    optimized: true,
    social: 'yt',
    fpMode: 'random'
  })
  const [freeProxies, setFreeProxies] = useState(0)
  const { fpBase, updateFpBase, fpPatch } = useSharedFingerprint(spec.platform)
  const [running, setRunning] = useState(false)
  // Latches once the batch has run. Guards against creating the same batch
  // twice — the run is not repeatable, so the buttons stay disabled after it.
  const [done, setDone] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{
    created: ProfileRow[]
    errors: { name: string; message: string }[]
  } | null>(null)

  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    void Promise.all([listProxies(workspace.workspace_id), listProfiles(workspace.workspace_id)])
      .then(([proxies, profiles]) => {
        if (cancelled) return
        const taken = new Set(
          profiles.filter((p) => p.proxy_host).map((p) => `${p.proxy_host}:${p.proxy_port}`)
        )
        setFreeProxies(proxies.filter((p) => !taken.has(`${p.host}:${p.port}`)).length)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [workspace])

  const rows = useMemo(() => batchNames(spec).map((name) => ({ name, tags: [] })), [spec])

  const summary = useMemo(
    () =>
      `${rows.length} profiles · ${spec.fpMode === 'shared' ? 'shared fingerprint' : 'randomized'} · ${
        spec.optimized ? 'YouTube-optimized' : 'generic'
      } · ${spec.proxyMode === 'pool' ? 'pooled proxies' : 'no proxy'}`,
    [rows.length, spec.fpMode, spec.optimized, spec.proxyMode]
  )

  if (!canCreate) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--t3)]">
        You don&apos;t have permission to create profiles.
      </div>
    )
  }

  const onRun = async (): Promise<void> => {
    if (!workspace || !canCreate || running || done) return
    setRunning(true)
    setProgress(0)
    const r = await runBulkCreate({
      rows,
      workspaceId: workspace.workspace_id,
      mode,
      spec,
      fpPatch,
      onProgress: () => setProgress((n) => n + 1)
    })
    setResults(r)
    setRunning(false)
    // A clean run is finished: leave for the profiles list the way the single
    // editor does. Staying put invites a second click that silently creates
    // the same batch again. If anything failed, stay so the per-row errors
    // stay readable — `done` still blocks a duplicate run of the whole batch.
    setDone(true)
    if (r.errors.length === 0) navigate('/profiles')
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header mirrors the profile editor's: identity left, mode + actions
          right, so create-single and create-bulk feel like one surface. */}
      <div className="editor-top">
        <div className="editor-top-l">
          <div
            className="editor-back"
            onClick={() => navigate('/profiles')}
            title="Back to profiles"
          >
            <ChevronLeft />
          </div>
          <div>
            <div className="editor-title">Create profiles</div>
            <div className="editor-sub">
              {rows.length} new {rows.length === 1 ? 'profile' : 'profiles'} in one batch
            </div>
          </div>
        </div>
        <div className="editor-top-r">
          <div className="vw-switch">
            <button type="button" className="vw-btn" onClick={() => navigate('/profiles/new')}>
              Single
            </button>
            <button type="button" className="vw-btn on">
              Bulk
            </button>
          </div>
          <Button variant="ghost" onClick={() => navigate('/profiles')}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Check size={15} />}
            disabled={running || done || rows.length === 0}
            onClick={() => void onRun()}
          >
            {running
              ? `Creating… ${progress}/${rows.length}`
              : done
                ? 'Created'
                : `Create ${rows.length} profiles`}
          </Button>
        </div>
      </div>

      {/* Batch / Fingerprint tabs. Importing from another browser lives in the
          Profiles page's Import menu, which handles each vendor's format. */}
      <div className="flex items-center border-b border-[var(--line)] px-6 gap-1">
        <Tab active={mode === 'batch'} onClick={() => setMode('batch')}>
          Batch
        </Tab>
        <Tab active={mode === 'fingerprint'} onClick={() => setMode('fingerprint')}>
          Fingerprint
        </Tab>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-5 space-y-4">
            {mode === 'fingerprint' ? (
              <FingerprintTab
                spec={spec}
                setSpec={setSpec}
                fpBase={fpBase}
                updateFpBase={updateFpBase}
                rows={rows}
                summary={summary}
              />
            ) : (
              <BatchTab
                spec={spec}
                setSpec={setSpec}
                workspace={workspace}
                freeProxies={freeProxies}
                running={running}
                rows={rows}
                summary={summary}
                onOpenFingerprint={() => setMode('fingerprint')}
              />
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-[var(--t3)]">
                {rows.length} profile{rows.length === 1 ? '' : 's'} ready
                {running && ` · creating ${progress} / ${rows.length}…`}
              </span>
              <button
                onClick={onRun}
                disabled={running || done || rows.length === 0}
                className="px-3 py-1.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                {running ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                {running ? 'Creating…' : `Create ${rows.length}`}
              </button>
            </div>
          </div>

          {results && (
            <div className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[var(--t1)]">Result</h3>
                <button
                  onClick={() => navigate('/profiles')}
                  className="text-[11px] text-[var(--red)] hover:underline"
                >
                  View profiles →
                </button>
              </div>
              <div className="text-xs space-y-1">
                <div className="text-[var(--green)]">✓ {results.created.length} created</div>
                {results.errors.length > 0 && (
                  <>
                    <div className="text-[var(--red)]">✗ {results.errors.length} failed</div>
                    <ul className="mt-2 space-y-0.5 mono text-[10px] text-[var(--t3)] max-h-40 overflow-auto">
                      {results.errors.map((e, i) => (
                        <li key={i}>
                          {e.name}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
