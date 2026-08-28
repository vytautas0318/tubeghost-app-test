// Pure selection math for the Profiles list, split out of
// useSelectionAndPaging so the shift-click range rules are unit-testable
// (the vitest env is node-only — hooks can't be rendered here).

/**
 * Ids a click should apply its new checked state to.
 *
 * Plain click → just the clicked row. Shift-click → the inclusive span between
 * the anchor and the clicked row, in either direction. Falls back to the single
 * row when the anchor is missing or is no longer on this page (filtered out,
 * or on another page) — a shift-click that can't resolve a span must still
 * toggle the row the user actually clicked.
 */
export function selectionSpan(
  pageIds: readonly string[],
  anchorId: string | null,
  id: string,
  range: boolean
): string[] {
  if (!range || !anchorId) return [id]
  const from = pageIds.indexOf(anchorId)
  const to = pageIds.indexOf(id)
  if (from < 0 || to < 0) return [id]
  const [lo, hi] = from <= to ? [from, to] : [to, from]
  return pageIds.slice(lo, hi + 1)
}

/** Applies `checked` to every id in `span`, returning a new set. */
export function applySpan(
  prev: ReadonlySet<string>,
  span: readonly string[],
  checked: boolean
): Set<string> {
  const next = new Set(prev)
  for (const id of span) {
    if (checked) next.add(id)
    else next.delete(id)
  }
  return next
}
