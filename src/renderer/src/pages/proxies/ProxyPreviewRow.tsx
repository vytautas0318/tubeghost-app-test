// One row in the AddProxiesPanel preview. Shows: parsed proxy, geo (if
// enriched), auth result (if tested). Pure presentational — no state.

import * as React from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import type { IpLookupResult } from '@/lib/edge'
import type { ProxyTestResult } from '@/lib/proxy-test'
import type { ParsedProxy } from '@/lib/proxies-parser'
import { Flag } from '@/components/Flag'

export interface EnrichedProxy {
  status: 'idle' | 'testing' | 'enriched'
  geo?: IpLookupResult | null
  test?: ProxyTestResult | null
}

export function ProxyPreviewRow({
  parsed,
  enrichment,
  autoTest
}: {
  parsed: ParsedProxy
  enrichment: EnrichedProxy | null
  autoTest: boolean
}): React.ReactElement {
  if (parsed.error) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="w-3.5 h-3.5 text-[var(--red)] shrink-0" />
          <code className="mono text-[var(--t1)] truncate">
            line {parsed.lineNumber}: {parsed.raw}
          </code>
        </div>
        <span className="text-[var(--red)] shrink-0 ml-3">{parsed.error}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-[10px] uppercase font-semibold text-[var(--t3)] w-12 shrink-0">
          {parsed.proxy_type}
        </span>
        <code className="mono text-[var(--t1)] truncate">
          {parsed.host}:{parsed.port}
          {parsed.username && (
            <span className="text-[var(--t4)]">
              {' '}
              · {parsed.username}
            </span>
          )}
        </code>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <GeoBadge enrichment={enrichment} />
        {autoTest && <TestBadge enrichment={enrichment} />}
      </div>
    </div>
  )
}

function GeoBadge({ enrichment }: { enrichment: EnrichedProxy | null }): React.ReactElement {
  if (!enrichment || enrichment.status === 'idle') {
    return <span className="text-[var(--t4)]">—</span>
  }
  if (enrichment.status === 'testing') {
    return <Loader2 className="w-3 h-3 animate-spin text-[var(--t4)]" />
  }
  const g = enrichment.geo
  if (!g || !g.country_code) {
    return <span className="text-[var(--t4)]">no geo</span>
  }
  return (
    <span className="text-[var(--t1)] inline-flex items-center gap-1.5">
      <Flag code={g.country_code} />
      {g.country_code}
    </span>
  )
}

function TestBadge({ enrichment }: { enrichment: EnrichedProxy | null }): React.ReactElement {
  if (!enrichment || enrichment.status === 'idle') {
    return <span className="text-[var(--t4)] w-16 text-right">—</span>
  }
  if (enrichment.status === 'testing') {
    return (
      <span className="text-[var(--t4)] w-16 text-right">testing…</span>
    )
  }
  const t = enrichment.test
  if (!t) {
    return <span className="text-[var(--t4)] w-16 text-right">—</span>
  }
  if (t.ok) {
    return (
      <span
        title={`egress ${t.egress_ip} · ${t.elapsed_ms}ms`}
        className="inline-flex items-center gap-1 text-[var(--green)] w-16 justify-end"
      >
        <Check className="w-3 h-3" />
        ok
      </span>
    )
  }
  return (
    <span
      title={t.error}
      className="inline-flex items-center gap-1 text-[var(--red)] w-16 justify-end"
    >
      <AlertCircle className="w-3 h-3" />
      {t.stage}
    </span>
  )
}
