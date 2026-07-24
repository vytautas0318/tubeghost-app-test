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
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Plus } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { createProfile, type ProfileRow } from '@/lib/profiles'

type Mode = 'csv' | 'template'

interface ParsedRow {
  name: string
  tags: string[]
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-[var(--panel-2)] border border-[var(--line)] rounded-lg text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30'

function parseCsv(raw: string): ParsedRow[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((line) => {
      const cells = line.split(',').map((c) => c.trim())
      const name = cells[0] || 'Untitled'
      const tags = cells
        .slice(1)
        .flatMap((c) => c.split(/[;|]/))
        .map((t) => t.trim())
        .filter(Boolean)
      return { name, tags }
    })
}

function expandTemplate(tmpl: string, count: number, startAt: number): ParsedRow[] {
  const out: ParsedRow[] = []
  for (let i = 0; i < count; i++) {
    const n = startAt + i
    const name = tmpl.includes('{n}') ? tmpl.replace(/\{n\}/g, String(n)) : `${tmpl} ${n}`
    out.push({ name, tags: [] })
  }
  return out
}

export function BulkCreate(): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const navigate = useNavigate()
  const canCreate = useHasPermission('profiles.create')

  const [mode, setMode] = useState<Mode>('template')
  const [csv, setCsv] = useState('')
  const [tmpl, setTmpl] = useState('YouTube — {n}')
  const [count, setCount] = useState(10)
  const [startAt, setStartAt] = useState(1)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{
    created: ProfileRow[]
    errors: { name: string; message: string }[]
  } | null>(null)

  const rows = useMemo(
    () => (mode === 'csv' ? parseCsv(csv) : expandTemplate(tmpl, count, startAt)),
    [mode, csv, tmpl, count, startAt]
  )

  if (!canCreate) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--t3)]">
        You don&apos;t have permission to create profiles.
      </div>
    )
  }

  const onRun = async (): Promise<void> => {
    if (!workspace || rows.length === 0) return
    setRunning(true)
    setProgress(0)
    const created: ProfileRow[] = []
    const errors: { name: string; message: string }[] = []
    for (const r of rows) {
      try {
        const p = await createProfile({
          workspace_id: workspace.workspace_id,
          name: r.name,
          tags: r.tags
        })
        created.push(p)
      } catch (e) {
        errors.push({ name: r.name, message: (e as Error).message })
      }
      setProgress((n) => n + 1)
    }
    setResults({ created, errors })
    setRunning(false)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-[var(--line)]">
        <h2 className="text-xl font-bold text-[var(--t1)]">Bulk create profiles</h2>
        <p className="text-xs text-[var(--t3)] mt-0.5">
          Each created profile inherits the workspace&apos;s safe-by-default fingerprint settings.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-5 space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setMode('template')}
                className={
                  mode === 'template'
                    ? 'px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--red)] text-white'
                    : 'px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--line)] text-[var(--t2)]'
                }
              >
                Name template
              </button>
              <button
                onClick={() => setMode('csv')}
                className={
                  mode === 'csv'
                    ? 'px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--red)] text-white'
                    : 'px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--line)] text-[var(--t2)]'
                }
              >
                Paste CSV
              </button>
            </div>

            {mode === 'template' ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3">
                  <label className="block text-[11px] font-semibold text-[var(--t2)] mb-1">
                    Name template (use <code className="mono">{'{n}'}</code> for the index)
                  </label>
                  <input
                    type="text"
                    value={tmpl}
                    onChange={(e) => setTmpl(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--t2)] mb-1">
                    Count
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--t2)] mb-1">
                    Start at
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={startAt}
                    onChange={(e) => setStartAt(Number(e.target.value) || 0)}
                    className={inputCls}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-semibold text-[var(--t2)] mb-1">
                  CSV — one profile per line: <code className="mono">name, tag1, tag2</code>
                </label>
                <textarea
                  rows={8}
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder={'YT Channel A, channel, eng\nYT Channel B, channel, esp'}
                  className={`${inputCls} mono text-xs resize-y`}
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-[var(--t3)]">
                {rows.length} profile{rows.length === 1 ? '' : 's'} ready
                {running && ` · creating ${progress} / ${rows.length}…`}
              </span>
              <button
                onClick={onRun}
                disabled={running || rows.length === 0}
                className="px-3 py-1.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
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
                <div className="text-[var(--green)]">
                  ✓ {results.created.length} created
                </div>
                {results.errors.length > 0 && (
                  <>
                    <div className="text-[var(--red)]">
                      ✗ {results.errors.length} failed
                    </div>
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
