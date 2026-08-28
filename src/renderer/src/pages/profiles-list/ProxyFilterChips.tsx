import * as React from 'react'

export type ProxyUseFilter = 'all' | 'unused' | 'used'

// All / Unused / Used chips for a proxy picker.
//
// Shared so the two places a proxy gets chosen — the profiles-list cell
// (ProxyCell) and the profile editor (SimpleProxySelect) — offer the same
// control. They looked and behaved differently before, which made the same
// task feel like two features.
//
// Counts are supplied by the caller because each picker computes them over its
// own search-matched set: a chip must never advertise rows the current search
// would hide.
export function ProxyFilterChips({
  filter,
  counts,
  onChange,
  className
}: {
  filter: ProxyUseFilter
  counts: Record<ProxyUseFilter, number>
  onChange: (f: ProxyUseFilter) => void
  className?: string
}): React.ReactElement {
  return (
    <div
      className={className ?? 'flex gap-1.5 px-2 py-2 border-b border-[var(--line)]'}
      role="tablist"
      aria-label="Filter proxies"
    >
      {(['all', 'unused', 'used'] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={filter === k}
          onClick={() => onChange(k)}
          className={
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ' +
            (filter === k
              ? 'bg-[var(--red)] border-[var(--red)] text-white'
              : 'bg-[var(--panel-2)] border-[var(--line)] text-[var(--t2)] hover:text-[var(--t1)]')
          }
        >
          {k === 'all' ? 'All' : k === 'unused' ? 'Unused' : 'Used'}
          <span className="font-medium text-[10.5px] opacity-75">{counts[k]}</span>
        </button>
      ))}
    </div>
  )
}
