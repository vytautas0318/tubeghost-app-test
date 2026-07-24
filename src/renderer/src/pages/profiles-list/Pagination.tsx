// Table-footer pagination: range indicator + rows-per-page + numbered page
// buttons (matches the TubeGhost design's ‹ 1 2 3 › pager).

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  selectedCount
}: {
  total: number
  page: number
  pageSize: PageSize
  onPageChange: (p: number) => void
  onPageSizeChange: (size: PageSize) => void
  selectedCount: number
}): React.ReactElement {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, pageCount)
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = Math.min(safePage * pageSize, total)
  const pages = pageList(safePage, pageCount)

  return (
    <div className="h-11 border-t border-[var(--line)] bg-[var(--panel-2)] flex items-center justify-between px-4 text-[12.5px] text-[var(--t3)]">
      <div>
        {selectedCount > 0 ? (
          <span className="font-semibold text-[var(--red)]">{selectedCount} selected</span>
        ) : total === 0 ? (
          'No profiles'
        ) : (
          <>
            Showing {start}–{end} of {total}
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
            className="px-1.5 py-0.5 bg-[var(--panel)] border border-[var(--line)] rounded text-[var(--t1)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--red)]/40"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className="pager">
          <div
            className={'pg' + (safePage <= 1 ? ' opacity-30 pointer-events-none' : '')}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </div>
          {pages.map((p, i) =>
            p === '…' ? (
              <div key={`e${i}`} className="pg pointer-events-none">
                …
              </div>
            ) : (
              <div
                key={p}
                className={'pg' + (p === safePage ? ' on' : '')}
                onClick={() => onPageChange(p)}
              >
                {p}
              </div>
            )
          )}
          <div
            className={'pg' + (safePage >= pageCount ? ' opacity-30 pointer-events-none' : '')}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Next page"
          >
            <ChevronRight />
          </div>
        </div>
      </div>
    </div>
  )
}

// Windowed page numbers: all pages when few, else 1 … cur-1 cur cur+1 … last.
function pageList(cur: number, count: number): (number | '…')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const lo = Math.max(2, cur - 1)
  const hi = Math.min(count - 1, cur + 1)
  if (lo > 2) out.push('…')
  for (let p = lo; p <= hi; p++) out.push(p)
  if (hi < count - 1) out.push('…')
  out.push(count)
  return out
}
