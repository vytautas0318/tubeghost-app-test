// Regression tests for duplicate-profile naming.
//
// The bug: duplicating the same profile twice produced two rows both named
// literally "Profile 2 (copy)" — indistinguishable in the profiles list.
// Chain-duplicating stacked suffixes ("X (copy) (copy) (copy)"), and the naive
// `(name + ' (copy)').slice(0, 100)` truncated INTO the suffix, leaving names
// that ended in a dangling " (".

import { describe, it, expect } from 'vitest'
import { nextCopyName } from '../profiles'

describe('nextCopyName', () => {
  it('numbers repeated duplicates of the same source', () => {
    const names = ['Profile 1', 'Profile 2', 'Profile 3']
    const a = nextCopyName('Profile 2', names)
    names.push(a)
    const b = nextCopyName('Profile 2', names)
    names.push(b)
    const c = nextCopyName('Profile 2', names)

    expect(a).toBe('Profile 2 (copy)')
    expect(b).toBe('Profile 2 (copy 2)')
    expect(c).toBe('Profile 2 (copy 3)')
    expect(new Set([a, b, c]).size).toBe(3)
  })

  it('does not stack suffixes when duplicating a copy', () => {
    expect(nextCopyName('Profile 2 (copy)', ['Profile 2 (copy)'])).toBe('Profile 2 (copy 2)')
    expect(nextCopyName('Profile 2 (copy 3)', ['Profile 2 (copy)'])).toBe('Profile 2 (copy 2)')
  })

  it('treats collisions case-insensitively', () => {
    expect(nextCopyName('Test', ['test (copy)'])).toBe('Test (copy 2)')
  })

  it('keeps the suffix intact when truncating a long name', () => {
    const long = 'A'.repeat(98)
    const first = nextCopyName(long, [])
    expect(first.length).toBeLessThanOrEqual(100)
    expect(first.endsWith(' (copy)')).toBe(true)

    const second = nextCopyName(long, [first])
    expect(second.length).toBeLessThanOrEqual(100)
    expect(second.endsWith(' (copy 2)')).toBe(true)
  })

  it('never returns an empty name', () => {
    expect(nextCopyName('(copy)', []).trim().length).toBeGreaterThan(0)
  })

  it('is a no-collision function against a large existing set', () => {
    const taken = ['Base']
    for (let i = 0; i < 25; i++) taken.push(nextCopyName('Base', taken))
    expect(new Set(taken.map((t) => t.toLowerCase())).size).toBe(taken.length)
  })
})
