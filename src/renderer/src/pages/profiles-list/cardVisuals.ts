// Deterministic per-profile visuals for the Simple (card) view.
//
// The design prototype coloured each card by group, handing out palette
// entries in first-seen order (ui_kits/browser/data.jsx → groupColor). That
// can't work here: the order profiles arrive in changes with sorting,
// filtering and paging, so a group's colour would move around between
// renders. Same palette, but indexed by a hash of the group name — stable
// for a given group forever, on every device.

import type { GhostFace } from '@/components/ghost-avatar-parts'

const GROUP_PALETTE = [
  '#E60001',
  '#2563EB',
  '#16A06A',
  '#7C3AED',
  '#C2820C',
  '#0EA5A5',
  '#DB2777',
  '#EA580C'
]

// FNV-1a. Cheap, no dependency, and well-spread for short strings.
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * The accent colour for a profile's avatar tile. Keyed on the group when the
 * profile has one, so a group reads as one colour block in the grid; on the
 * profile's own id otherwise, so ungrouped profiles stay distinguishable
 * instead of all rendering the same colour.
 */
export function groupColor(group: string, fallbackKey: string): string {
  const key = group && group !== '—' ? group : fallbackKey
  return GROUP_PALETTE[hash(key) % GROUP_PALETTE.length]
}

const FACES: GhostFace[] = ['neutral', 'happy', 'wink', 'surprised']

/** The mascot's expression. Per-profile and stable — purely decorative. */
export function profileFace(id: string): GhostFace {
  return FACES[hash(id) % FACES.length]
}
