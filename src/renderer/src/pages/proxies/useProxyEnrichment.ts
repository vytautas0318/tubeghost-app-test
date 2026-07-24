// Manual enrichment for the AddProxiesPanel.
// Caller invokes `runChecks()` (e.g. from a "Check proxies" button) which
// fans out geo + auth lookups across the unique host:port set, with
// concurrency capped so we don't blow up the network tab.
//
// Returns a per-key status map plus a `running` flag and the runner.
// We do NOT auto-run on paste — the user opted in by clicking the button.

import { useCallback, useRef, useState } from 'react'
import { lookupIp } from '@/lib/edge'
import { testProxy } from '@/lib/proxy-test'
import type { ParsedProxy } from '@/lib/proxies-parser'
import type { EnrichedProxy } from './ProxyPreviewRow'

const CONCURRENCY = 4

export interface ProxyEnrichmentApi {
  enriched: Record<string, EnrichedProxy>
  running: boolean
  runChecks: (parsed: ParsedProxy[], options?: { authTest: boolean }) => Promise<void>
  reset: () => void
}

export function useProxyEnrichment(): ProxyEnrichmentApi {
  const [enriched, setEnriched] = useState<Record<string, EnrichedProxy>>({})
  const [running, setRunning] = useState(false)
  const cancelRef = useRef(false)

  const reset = useCallback((): void => {
    cancelRef.current = true
    setEnriched({})
    setRunning(false)
  }, [])

  const runChecks = useCallback(
    async (parsed: ParsedProxy[], options: { authTest: boolean } = { authTest: true }) => {
      cancelRef.current = false

      // Build the dedup'd task list. Skip parse-error rows entirely.
      const seen = new Set<string>()
      const tasks: ParsedProxy[] = []
      for (const p of parsed) {
        if (p.error) continue
        const k = `${p.host}:${p.port}`
        if (seen.has(k)) continue
        seen.add(k)
        tasks.push(p)
      }
      if (tasks.length === 0) return

      // Mark every task as testing up-front so the UI shows the spinner.
      setEnriched((prev) => {
        const next = { ...prev }
        for (const t of tasks) {
          next[`${t.host}:${t.port}`] = { status: 'testing' }
        }
        return next
      })
      setRunning(true)

      let i = 0
      const workers: Promise<void>[] = []
      for (let w = 0; w < CONCURRENCY; w++) {
        workers.push(
          (async () => {
            while (i < tasks.length) {
              const t = tasks[i++]
              if (cancelRef.current) return
              const k = `${t.host}:${t.port}`
              const [geo, test] = await Promise.all([
                lookupIp(t.host).catch(() => null),
                options.authTest
                  ? testProxy(t).catch((e: Error) => ({
                      ok: false as const,
                      stage: 'request' as const,
                      error: e.message,
                      elapsed_ms: 0
                    }))
                  : Promise.resolve(null)
              ])
              if (cancelRef.current) return
              setEnriched((prev) => ({
                ...prev,
                [k]: { status: 'enriched', geo: geo ?? null, test: test ?? null }
              }))
            }
          })()
        )
      }
      await Promise.all(workers)
      setRunning(false)
    },
    []
  )

  return { enriched, running, runChecks, reset }
}
