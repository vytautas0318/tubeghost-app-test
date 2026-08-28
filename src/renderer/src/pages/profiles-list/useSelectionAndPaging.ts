// Owns selection (multi-select set) + pagination state for the
// Profiles list. Lifted out of ProfilesList.tsx to keep the page
// component under the size cap.
//
// Behaviour:
//  - Select-all toggles only the visible page, not the whole filter.
//  - Selections that fall out of the filter set are pruned automatically.
//  - Page index is clamped on filter / page-size changes.
//  - Page size persists in localStorage.

import { useEffect, useMemo, useRef, useState } from 'react'
import { PAGE_SIZE_OPTIONS, type PageSize } from './Pagination'
import { applySpan, selectionSpan } from './selectionRange'

const STORAGE_KEY = 'tpb.profiles.pageSize'

export interface UseSelectionAndPagingResult<T extends { id: string }> {
  paged: T[]
  pageIds: string[]
  pageCount: number
  safePage: number
  page: number
  setPage: (n: number) => void
  pageSize: PageSize
  setPageSize: (n: PageSize) => void
  selected: Set<string>
  selectedCount: number
  pageSelectedCount: number
  onToggleRow: (id: string, checked: boolean, range?: boolean) => void
  onToggleSelectAll: (checked: boolean) => void
  clearSelection: () => void
}

export function useSelectionAndPaging<T extends { id: string }>(
  filtered: T[],
  resetKeys: ReadonlyArray<unknown>
): UseSelectionAndPagingResult<T> {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY))
      if (PAGE_SIZE_OPTIONS.includes(saved as PageSize)) return saved as PageSize
    } catch { /* ignore */ }
    return 25
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(pageSize))
    } catch { /* ignore */ }
  }, [pageSize])

  // Reset to page 1 whenever any filter or sort changes, or pageSize.
  useEffect(() => {
    setPage(1)
    // resetKeys is the stable list of "things that should reset paging"
    // (filters, sort, group). useEffect deps must be a literal array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...resetKeys, pageSize])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize]
  )

  // Drop selections that are no longer in the filtered set.
  useEffect(() => {
    const visibleIds = new Set(filtered.map((p) => p.id))
    setSelected((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [filtered])

  const pageIds = useMemo(() => paged.map((p) => p.id), [paged])
  const pageSelectedCount = pageIds.reduce(
    (acc, id) => acc + (selected.has(id) ? 1 : 0),
    0
  )

  // Last row toggled without shift — the anchor a shift-click extends from.
  // A ref, not state: it must not re-render the list, and the handler needs to
  // read the value set by the immediately preceding click.
  const anchorRef = useRef<string | null>(null)

  const onToggleRow = (id: string, checked: boolean, range = false): void => {
    // Shift-click extends from the anchor to this row, applying THIS row's new
    // checked state across the whole span (so shift-unchecking clears a range
    // too). selectionSpan falls back to the single row when no span resolves.
    const anchor = anchorRef.current
    const span = selectionSpan(pageIds, anchor, id, range)
    setSelected((prev) => applySpan(prev, span, checked))
    // A resolved shift-click keeps the existing anchor, so repeated
    // shift-clicks re-extend from the same origin rather than walking it
    // forward one row at a time. Every other click — including a shift-click
    // whose anchor is no longer on this page — sets a fresh anchor.
    if (!(range && anchor && pageIds.includes(anchor))) anchorRef.current = id
  }

  const onToggleSelectAll = (checked: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) for (const id of pageIds) next.add(id)
      else for (const id of pageIds) next.delete(id)
      return next
    })
  }

  return {
    paged,
    pageIds,
    pageCount,
    safePage,
    page,
    setPage,
    pageSize,
    setPageSize,
    selected,
    selectedCount: selected.size,
    pageSelectedCount,
    onToggleRow,
    onToggleSelectAll,
    clearSelection: () => setSelected(new Set())
  }
}
