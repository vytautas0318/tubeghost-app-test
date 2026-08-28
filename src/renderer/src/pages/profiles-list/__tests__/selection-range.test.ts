import { describe, it, expect } from 'vitest'
import { applySpan, selectionSpan } from '../selectionRange'

const PAGE = ['a', 'b', 'c', 'd', 'e']

describe('selectionSpan', () => {
  it('returns just the clicked row without shift', () => {
    expect(selectionSpan(PAGE, 'a', 'd', false)).toEqual(['d'])
  })

  it('fills the inclusive span downward from the anchor', () => {
    expect(selectionSpan(PAGE, 'b', 'd', true)).toEqual(['b', 'c', 'd'])
  })

  it('fills the same span when shift-clicking upward', () => {
    // Direction must not matter — clicking d then shift-clicking b selects the
    // same three rows as the reverse.
    expect(selectionSpan(PAGE, 'd', 'b', true)).toEqual(['b', 'c', 'd'])
  })

  it('spans the whole page from first to last', () => {
    expect(selectionSpan(PAGE, 'a', 'e', true)).toEqual(PAGE)
  })

  it('returns the single row when anchor and target are the same', () => {
    expect(selectionSpan(PAGE, 'c', 'c', true)).toEqual(['c'])
  })

  it('falls back to the single row with no anchor yet', () => {
    // First click of the session: shift held, but nothing to extend from.
    expect(selectionSpan(PAGE, null, 'c', true)).toEqual(['c'])
  })

  it('falls back to the single row when the anchor left the page', () => {
    // Anchor was filtered out or is on another page — the clicked row must
    // still toggle rather than doing nothing.
    expect(selectionSpan(PAGE, 'zz', 'c', true)).toEqual(['c'])
  })
})

describe('applySpan', () => {
  it('adds every id in the span', () => {
    expect([...applySpan(new Set(['a']), ['b', 'c'], true)].sort()).toEqual(['a', 'b', 'c'])
  })

  it('removes every id in the span when unchecking', () => {
    // Shift-unchecking clears the range instead of inverting each row.
    expect([...applySpan(new Set(['a', 'b', 'c']), ['b', 'c'], false)]).toEqual(['a'])
  })

  it('leaves selections outside the span untouched', () => {
    expect([...applySpan(new Set(['e']), ['a', 'b'], true)].sort()).toEqual(['a', 'b', 'e'])
  })

  it('does not mutate the input set', () => {
    const prev = new Set(['a'])
    applySpan(prev, ['b'], true)
    expect([...prev]).toEqual(['a'])
  })
})
