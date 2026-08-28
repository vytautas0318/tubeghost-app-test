// Per-profile avatar colour for the Simple view's ghost.
//
// PALETTE is the design export's GROUP_PALETTE (data.jsx), ported verbatim.
// Note this is the avatar palette, deliberately independent of the app's accent
// token — these eight must stay distinct from each other whatever accent the
// user picks, so they are literals rather than var(--red) & co.
const PALETTE = [
  '#E60001',
  '#2563EB',
  '#16A06A',
  '#7C3AED',
  '#C2820C',
  '#0EA5A5',
  '#DB2777',
  '#EA580C'
]

// The export assigns a colour per GROUP, by insertion order:
//   GROUP_PALETTE[Object.keys(GROUP_COLORS).length % GROUP_PALETTE.length]
// That's a prototype shortcut and can't ship as-is: the colour depends on the
// order groups are first encountered, so it changes across restarts, re-sorts
// and filtering — exactly the stability the brief rules out. It also collapses
// every ungrouped profile onto one colour, which is the common case here (all
// five test profiles show "No group").
//
// So we keep the export's palette and its group-level intent, but derive the
// index by hashing a stable key instead of counting insertions:
//   • grouped profiles hash on group_id → every profile in a group shares a
//     colour, which is the export's actual visual idea;
//   • ungrouped profiles hash on their own id → they stay distinguishable
//     rather than all rendering identically.
//
// FNV-1a with a final avalanche mix. A simpler `h * 31 + c` (as lib/tags.ts
// uses for tag names) clusters badly on UUID-shaped keys — measured 3 distinct
// colours across 5 profiles and an 8.8–19.2% skew. The avalanche step scatters
// the low bits to ~12.5% per colour.
function hashIndex(key: string, mod: number): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 2246822507) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 3266489909) >>> 0
  h ^= h >>> 16
  return (h >>> 0) % mod
}

export function profileColor(profileId: string, groupId?: string | null): string {
  const key = groupId && groupId.trim() !== '' ? `g:${groupId}` : `p:${profileId}`
  return PALETTE[hashIndex(key, PALETTE.length)]
}
