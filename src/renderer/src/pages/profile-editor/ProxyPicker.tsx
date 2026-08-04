// Workspace-pool proxy picker. Lists workspace proxies with search +
// filter chips (All / Unused / Tested). Picking one calls
// assignProxyToProfile() which copies fields inline onto the profile row.

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  listProfileNumbersByProxy,
  listProxies,
  type ProxyRow
} from '@/lib/proxies'
import { useWorkspace } from '@/store/workspace'
import { PickerFilterChip, ProxyPickerRow } from './ProxyPickerRow'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: ProxyRow[]; usage: Record<string, number[]> }
  | { kind: 'error'; message: string }

type FilterMode = 'all' | 'unused' | 'tested'

export function ProxyPicker({
  currentProxyHost,
  currentProxyPort,
  onPick,
  disabled
}: {
  currentProxyHost: string | null
  currentProxyPort: number | null
  onPick: (proxy: ProxyRow) => void
  disabled: boolean
}): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    // Re-fetch on workspace change (initial load) AND on proxy
    // assignment change for the current profile (so the just-assigned
    // proxy correctly shows as "used" + the in-list "× used" badge
    // updates immediately). On non-initial refetches we keep the
    // existing list rendered while the new data loads — no spinner
    // flash.
    // Usage is resolved against the proxy rows so profiles saved before
    // proxy_id was written (host:port only) still count as "used".
    listProxies(workspace.workspace_id)
      .then(async (rows) => {
        const usage = await listProfileNumbersByProxy(workspace.workspace_id, rows).catch(
          () => ({}) as Record<string, number[]>
        )
        return { rows, usage }
      })
      .then(({ rows, usage }) => !cancelled && setState({ kind: 'ready', rows, usage }))
      .catch((e: Error) => !cancelled && setState({ kind: 'error', message: e.message }))
    return () => {
      cancelled = true
    }
  }, [workspace?.workspace_id, currentProxyHost, currentProxyPort])

  // Only ACTIVE proxies are assignable, or the picker would hand a new
  // profile a dead egress. Purchased proxies are already filtered to active
  // server-side, so in practice this catches CUSTOM proxies, whose status
  // (expired / released / error) is set locally. Matches listUnusedProxies()
  // and the profiles-list inline picker.
  const selectable = useMemo<ProxyRow[]>(
    () => (state.kind === 'ready' ? state.rows.filter((r) => r.status === 'active') : []),
    [state]
  )
  const hiddenCount = state.kind === 'ready' ? state.rows.length - selectable.length : 0

  const counts = useMemo(() => {
    if (state.kind !== 'ready') return { all: 0, unused: 0, tested: 0 }
    const isUsed = (id: string): boolean => (state.usage[id]?.length ?? 0) > 0
    return {
      all: selectable.length,
      unused: selectable.filter((r) => !isUsed(r.id)).length,
      tested: selectable.filter((r) => r.last_test_ok === true).length
    }
  }, [state, selectable])

  const filtered = useMemo<ProxyRow[]>(() => {
    if (state.kind !== 'ready') return []
    const isUsed = (id: string): boolean => (state.usage[id]?.length ?? 0) > 0
    const q = search.trim().toLowerCase()
    let out = selectable
    if (filterMode === 'unused') out = out.filter((r) => !isUsed(r.id))
    if (filterMode === 'tested') out = out.filter((r) => r.last_test_ok === true)
    if (q) {
      out = out.filter(
        (r) =>
          (r.label ?? '').toLowerCase().includes(q) ||
          r.host.toLowerCase().includes(q) ||
          String(r.port).includes(q) ||
          (r.country_code ?? '').toLowerCase().includes(q) ||
          (r.country_name ?? '').toLowerCase().includes(q)
      )
    }
    // Sort: tested-OK first, untested second, failed last.
    const score = (r: ProxyRow): number =>
      r.last_test_ok === true ? 0 : r.last_test_ok === null ? 1 : 2
    return [...out].sort((a, b) => {
      const sa = score(a)
      const sb = score(b)
      if (sa !== sb) return sa - sb
      return (a.label ?? a.host).localeCompare(b.label ?? b.host)
    })
  }, [state, selectable, search, filterMode])

  if (state.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--t3)] py-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading workspace proxies…
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="text-xs text-[var(--red)]">
        Failed to load: {state.message}
      </div>
    )
  }

  if (counts.all === 0) {
    return (
      <div className="px-3 py-4 bg-[var(--panel-2)] rounded-md text-xs text-[var(--t2)]">
        {hiddenCount > 0 ? (
          <>
            No usable proxies — {hiddenCount === 1 ? 'the only one' : `all ${hiddenCount}`} in this
            workspace {hiddenCount === 1 ? 'has' : 'have'} expired.{' '}
            <Link to="/proxies" className="text-[var(--red)] hover:underline font-medium">
              Renew or add proxies →
            </Link>
          </>
        ) : (
          <>
            No proxies in this workspace yet.{' '}
            <Link to="/proxies" className="text-[var(--red)] hover:underline font-medium">
              Add proxies →
            </Link>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="mb-2.5 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--t4)]" />
          <input
            type="text"
            placeholder="Search by label, host, country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-2.5 py-1 text-xs bg-[var(--panel)] border border-[var(--line)] rounded-md text-[var(--t1)] placeholder:text-[var(--t4)] dark:placeholder:text-night-muted focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
          />
        </div>
        <PickerFilterChip label="All" count={counts.all}
          active={filterMode === 'all'} onClick={() => setFilterMode('all')} />
        <PickerFilterChip label="Unused" count={counts.unused}
          active={filterMode === 'unused'} onClick={() => setFilterMode('unused')} />
        <PickerFilterChip label="Tested" count={counts.tested}
          active={filterMode === 'tested'} onClick={() => setFilterMode('tested')} />
      </div>

      {filtered.length === 0 ? (
        <div className="px-3 py-4 bg-[var(--panel-2)] rounded-md text-xs text-[var(--t3)]">
          No proxies match {search ? `"${search}"` : `the "${filterMode}" filter`}.
        </div>
      ) : (
        <div className="max-h-80 overflow-auto border border-[var(--line)] rounded-md divide-y divide-[var(--line-2)]">
          {filtered.map((p) => (
            <ProxyPickerRow
              key={p.id}
              proxy={p}
              isCurrent={p.host === currentProxyHost && p.port === currentProxyPort}
              usage={state.usage[p.id]?.length ?? 0}
              disabled={disabled}
              onPick={() => onPick(p)}
            />
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <div className="mt-2 text-[11px] text-[var(--t3)]">
          {hiddenCount} expired {hiddenCount === 1 ? 'proxy is' : 'proxies are'} hidden — they
          can&apos;t be assigned to a profile.
        </div>
      )}
    </>
  )
}
