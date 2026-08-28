import * as React from 'react'
import { X, Globe } from 'lucide-react'
import { ProxyFilterChips, type ProxyUseFilter } from './ProxyFilterChips'
import type { ProxyRow } from '@/lib/proxies'
import type { ProfileRow as ProfileRowType } from '@/lib/profiles'

// The proxy picker popover, split out of InlineCells to keep that file inside
// the 250-line cap after the All/Unused/Used chips were added. Purely
// presentational — all state and the save call stay in ProxyCell.
export function ProxyPickerPanel({
  panelRef,
  style,
  stop,
  search,
  setSearch,
  filter,
  setFilter,
  counts,
  shown,
  proxies,
  loading,
  assigned,
  raw,
  onPick,
  onClear
}: {
  panelRef: React.RefObject<HTMLDivElement | null>
  style: React.CSSProperties
  stop: (e: React.MouseEvent) => void
  search: string
  setSearch: (v: string) => void
  filter: ProxyUseFilter
  setFilter: (f: ProxyUseFilter) => void
  counts: Record<ProxyUseFilter, number>
  shown: ProxyRow[]
  proxies: ProxyRow[] | null
  loading: boolean
  assigned: React.ReactNode
  raw: ProfileRowType
  onPick: (p: ProxyRow) => void
  onClear: () => void
}): React.ReactElement {
  return (
    <div
      ref={panelRef}
      style={style}
      onClick={stop}
      className="z-50 w-80 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)]"
    >
      <div className="p-2 border-b border-[var(--line)]">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search or paste IP:port…"
          className="w-full px-2 py-1.5 text-xs bg-[var(--panel-2)] border border-[var(--line)] rounded-[var(--r-sm)] text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
        />
      </div>
      <ProxyFilterChips filter={filter} counts={counts} onChange={setFilter} />
      <div className="max-h-60 overflow-auto py-1">
        {assigned && (
          <button
            onClick={onClear}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--red-soft)] text-[var(--red)] flex items-center gap-2"
          >
            <X className="w-3 h-3" />
            Remove proxy from profile
          </button>
        )}
        {assigned && shown.length > 0 && <div className="my-1 border-t border-[var(--line-2)]" />}
        {loading && <div className="px-3 py-2 text-xs text-[var(--t3)]">Loading proxies…</div>}
        {!loading && shown.length === 0 && (
          <div className="px-3 py-2 text-xs text-[var(--t3)] italic">
            {proxies && proxies.length === 0
              ? 'No proxies in this workspace yet.'
              : filter === 'unused'
                ? 'Every proxy is already assigned to a profile.'
                : filter === 'used'
                  ? 'No proxy is assigned to a profile yet.'
                  : 'No matches.'}
          </div>
        )}
        {shown.map((p) => {
          const isCurrent = p.host === raw.proxy_host && p.port === raw.proxy_port
          return (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--hover)]"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-3 h-3 text-[var(--red)] shrink-0" />
                <span className="mono text-[var(--t1)] truncate">
                  {p.host}:{p.port}
                </span>
                {p.country_code && (
                  <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-[var(--hover)] text-[var(--t3)]">
                    {p.country_code}
                  </span>
                )}
                {isCurrent && (
                  <span className="ml-auto text-[10px] text-[var(--red)] font-semibold">✓</span>
                )}
              </div>
              {(p.city || p.label) && (
                <div className="text-[10px] text-[var(--t3)] mt-0.5 truncate pl-[18px]">
                  {[p.country_code, p.city].filter(Boolean).join(' · ') || p.label}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
