import { describe, it, expect } from 'vitest'
import { batchNames, padNum, MAX_BATCH, type BatchSpec } from '../batchSpec'

const spec = (over: Partial<BatchSpec> = {}): BatchSpec => ({
  prefix: 'Crime Dynasty',
  start: 1,
  count: 10,
  platform: 'windows',
  groupId: null,
  proxyMode: 'pool',
  optimized: true,
  social: 'yt',
  fpMode: 'random',
  ...over
})

describe('batchNames', () => {
  it('numbers from the start value, zero-padded', () => {
    expect(batchNames(spec({ count: 3 }))).toEqual([
      'Crime Dynasty — 01',
      'Crime Dynasty — 02',
      'Crime Dynasty — 03'
    ])
  })

  it('honours a non-1 start', () => {
    expect(batchNames(spec({ count: 2, start: 9 }))).toEqual([
      'Crime Dynasty — 09',
      'Crime Dynasty — 10'
    ])
  })

  it('generates exactly `count` names', () => {
    expect(batchNames(spec({ count: 50 }))).toHaveLength(50)
    expect(batchNames(spec({ count: 1 }))).toHaveLength(1)
  })

  it('falls back to a usable name when the prefix is blank', () => {
    // An empty prefix would otherwise produce " — 01", which reads as broken.
    expect(batchNames(spec({ prefix: '   ', count: 1 }))[0]).toBe('Profile — 01')
  })

  it('does not pad past two digits', () => {
    expect(padNum(9)).toBe('09')
    expect(padNum(10)).toBe('10')
    expect(padNum(100)).toBe('100')
  })

  it('caps at the batch size the UI enforces', () => {
    expect(MAX_BATCH).toBe(60)
  })
})
