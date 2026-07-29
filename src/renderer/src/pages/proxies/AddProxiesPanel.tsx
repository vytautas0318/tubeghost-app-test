// In-line panel for adding one OR many proxies via paste.
// Replaces the modal (which blocked bulk-add by being one-at-a-time).
//
// Flow: user pastes lines → smart parser splits them → user clicks
// "Check proxies" to enrich each unique host:port (geo via Edge Function,
// auth via main-process IPC). Then "Add N proxies" inserts only the
// rows that passed. We deliberately do NOT auto-check on paste —
// the user opts in by clicking the button.

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { parseProxies, type ParsedProxy } from '@/lib/proxies-parser'
import { createCustomProxy, type ProxyRow } from '@/lib/proxies'
import { ProxyPreviewRow } from './ProxyPreviewRow'
import { AddProxiesActions } from './AddProxiesActions'
import { useProxyEnrichment } from './useProxyEnrichment'

const MAX_LINES = 100

export function AddProxiesPanel({
  workspaceId,
  onClose,
  onAdded
}: {
  workspaceId: string
  onClose: () => void
  onAdded: (rows: ProxyRow[]) => void
}): React.ReactElement {
  const [input, setInput] = useState('')
  const [parsed, setParsed] = useState<ParsedProxy[]>([])
  const [requireAuthCheck, setRequireAuthCheck] = useState(true)
  const [defaultType, setDefaultType] = useState<ParsedProxy['proxy_type']>('http')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Re-parse whenever input or default protocol changes (debounced 300ms).
  // Parsing is cheap + local — only the network checks are gated behind
  // the explicit "Check proxies" button.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const p = parseProxies(input, defaultType).slice(0, MAX_LINES)
      setParsed(p)
    }, 300)
    return () => window.clearTimeout(t)
  }, [input, defaultType])

  // Manual enrichment — caller fires runChecks() from the button.
  const { enriched, running, runChecks, reset } = useProxyEnrichment()

  // If the user edits the input after a check, drop the stale results so
  // the badges reflect "not checked yet" again.
  useEffect(() => {
    reset()
    // Intentionally only on input change — not on `reset` identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, defaultType])

  const validParsed = parsed.filter((p) => !p.error)
  const errorParsed = parsed.filter((p) => p.error)

  // A row is "checked" once we have enrichment for it.
  const checkedCount = useMemo(
    () =>
      validParsed.filter((p) => enriched[`${p.host}:${p.port}`]?.status === 'enriched').length,
    [validParsed, enriched]
  )

  // Rows ready to insert. If auth-check is required, every row must have
  // passed. If the user opted out, all parseable rows are eligible.
  const readyToInsert = useMemo(
    () =>
      validParsed.filter((p) => {
        if (!requireAuthCheck) return true
        const e = enriched[`${p.host}:${p.port}`]
        return e?.status === 'enriched' && e.test?.ok === true
      }),
    [validParsed, enriched, requireAuthCheck]
  )

  // Rows that were checked but failed the auth/connect test. We split out
  // connect/timeout failures specifically: those often mean the *checker*
  // (a cloud edge function on a shifting IP) couldn't reach an
  // IP-allowlisted proxy that works fine from the user's own machine —
  // not that the proxy is broken. In that case "uncheck auth" is the fix.
  const failedChecks = useMemo(() => {
    let auth = 0
    let reachability = 0
    for (const p of validParsed) {
      const e = enriched[`${p.host}:${p.port}`]
      if (e?.status !== 'enriched') continue
      const t = e.test
      if (!t || t.ok !== false) continue
      if (t.stage === 'connect' || t.stage === 'timeout') reachability += 1
      else auth += 1
    }
    return { auth, reachability, total: auth + reachability }
  }, [validParsed, enriched])

  const onCheckProxies = (): void => {
    void runChecks(parsed, { authTest: true })
  }

  const onSubmit = async (): Promise<void> => {
    setSubmitting(true)
    setSubmitError(null)
    const created: ProxyRow[] = []
    try {
      for (const p of readyToInsert) {
        const e = enriched[`${p.host}:${p.port}`]
        const geo = e?.geo
        const row = await createCustomProxy({
          workspace_id: workspaceId,
          proxy_type: p.proxy_type,
          host: p.host,
          port: p.port,
          username: p.username,
          password: p.password,
          country_code: geo?.country_code ?? null,
          country_name: geo?.country_name ?? null,
          city: geo?.city ?? null,
          region: geo?.region ?? null,
          timezone: geo?.timezone ?? null
        })
        created.push(row)
      }
      onAdded(created)
    } catch (e) {
      setSubmitError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const placeholder =
    'Paste one proxy per line. Any of these formats:\n' +
    '  198.51.100.42:8080\n' +
    '  198.51.100.42:8080:user:pass\n' +
    '  http://198.51.100.42:8080:user:pass\n' +
    '  socks5://198.51.100.42:1080:user:pass\n' +
    '  user:pass@198.51.100.42:8080'

  return (
    <div className="border-b border-[var(--line)] bg-brand-surface/30 dark:bg-night-surface/40">
      <div className="px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--t1)]">
            Add proxies
          </h3>
          <p className="text-[11px] text-[var(--t3)] mt-0.5">
            Paste up to {MAX_LINES}, then click <strong>Check proxies</strong> to verify.
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-white/60 dark:hover:bg-night-raised text-[var(--t3)]"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-6 pb-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--t3)]">
            Default protocol
          </span>
          <div className="inline-flex rounded-lg border border-[var(--line)] bg-white dark:bg-night-base p-0.5">
            {(['http', 'https', 'socks5'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDefaultType(t)}
                className={
                  defaultType === t
                    ? 'px-2.5 py-1 text-[11px] font-semibold uppercase rounded-md bg-[var(--red)] text-white'
                    : 'px-2.5 py-1 text-[11px] font-semibold uppercase rounded-md text-[var(--t3)] hover:text-[var(--t1)] dark:hover:text-night-text'
                }
              >
                {t}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-[var(--t3)]">
            Lines that include their own <code className="mono">scheme://</code> override this.
          </span>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={Math.min(8, Math.max(4, input.split('\n').length))}
          placeholder={placeholder}
          spellCheck={false}
          className="w-full px-3 py-2 text-xs mono bg-white dark:bg-night-base border border-[var(--line)] rounded-lg text-[var(--t1)] placeholder:text-[var(--t3)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 resize-y"
        />

        {/* Per-line preview list */}
        {parsed.length > 0 && (
          <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-white dark:bg-night-base divide-y divide-[var(--line)] max-h-[280px] overflow-y-auto">
            {parsed.map((p, i) => (
              <ProxyPreviewRow
                key={`${p.lineNumber}-${i}`}
                parsed={p}
                enrichment={p.error ? null : enriched[`${p.host}:${p.port}`] ?? { status: 'idle' }}
                autoTest={requireAuthCheck}
              />
            ))}
          </div>
        )}

        {/* Counts + check button */}
        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-1.5 text-[var(--t2)] cursor-pointer">
            <input
              type="checkbox"
              checked={requireAuthCheck}
              onChange={(e) => setRequireAuthCheck(e.target.checked)}
              className="rounded"
            />
            Require auth check to pass before adding
          </label>
          <div className="text-[var(--t3)]">
            {parsed.length === 0 ? (
              'no lines yet'
            ) : (
              <>
                {validParsed.length} parsed
                {errorParsed.length > 0 && (
                  <span className="text-[var(--red)]">
                    {' '}
                    · {errorParsed.length} unparseable
                  </span>
                )}
                {checkedCount > 0 && <> {`· ${checkedCount} checked`}</>}
                {' · '}
                <strong className="text-[var(--t1)]">
                  {readyToInsert.length}
                </strong>{' '}
                ready
              </>
            )}
          </div>
        </div>

        {/* Explain why nothing is ready when checks failed on reachability —
            the common "checker can't reach an IP-allowlisted proxy" case. */}
        {requireAuthCheck && readyToInsert.length === 0 && failedChecks.reachability > 0 && (
          <div className="text-xs text-[var(--t2)] bg-[var(--red-soft)] border border-[var(--red)]/20 rounded-lg px-3 py-2 space-y-1">
            <p>
              <strong className="text-[var(--t1)]">
                {failedChecks.reachability} {failedChecks.reachability === 1 ? 'proxy' : 'proxies'} couldn&apos;t
                be reached
              </strong>{' '}
              by the checker. If your provider allowlists by IP, the cloud checker&apos;s IP
              isn&apos;t on the list — the proxy may still work from your machine.
            </p>
            <button
              type="button"
              onClick={() => setRequireAuthCheck(false)}
              className="underline text-[var(--red)] hover:text-[var(--red-hover)]"
            >
              Add without requiring the auth check to pass
            </button>
          </div>
        )}

        {submitError && (
          <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] border border-[var(--red)]/20 rounded-lg px-3 py-2">
            {submitError}
          </div>
        )}

        <AddProxiesActions
          validCount={validParsed.length}
          readyCount={readyToInsert.length}
          running={running}
          submitting={submitting}
          disabledReason={
            readyToInsert.length > 0
              ? undefined
              : failedChecks.total > 0
                ? `${failedChecks.total} ${failedChecks.total === 1 ? 'proxy' : 'proxies'} failed the auth check — resolve or uncheck "Require auth check" above`
                : requireAuthCheck
                  ? 'Click "Check proxies" first — a proxy is only ready once its auth check passes'
                  : 'Paste at least one valid proxy'
          }
          onCancel={onClose}
          onCheck={onCheckProxies}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  )
}

