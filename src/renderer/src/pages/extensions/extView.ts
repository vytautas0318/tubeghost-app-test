// Pure view-model helpers: map an ExtensionWithAssignment row → the bits the
// card renders (permission-scope badge, assignment summary, letter-tile
// gradient). No React, no I/O — trivially testable and shared by the card
// and the browse/recommended list.

import type { ExtensionWithAssignment, PermissionScope } from '@/lib/extensions'
import type { GroupRow } from '@/lib/groups'

// Permission scope → dot color token + label. Mirrors the design-system
// mapping (no --neutral token; minimal uses the muted --t4 gray).
export const SCOPE_META: Record<PermissionScope, { color: string; label: string }> = {
  broad: { color: 'var(--amber)', label: 'Broad access' },
  limited: { color: 'var(--blue)', label: 'Limited' },
  minimal: { color: 'var(--t4)', label: 'Minimal' }
}

export function scopeMeta(scope: PermissionScope | null): { color: string; label: string } {
  return SCOPE_META[scope ?? 'minimal']
}

// Deterministic letter-tile gradient from the name, so an extension with no
// manifest icon still gets a stable colored tile (never random per render).
const GRADS: Array<[string, string]> = [
  ['#F0322E', '#D82822'],
  ['#16A06A', '#0E8A5A'],
  ['#7C3AED', '#6D28D9'],
  ['#2563EB', '#1657C7'],
  ['#C2820C', '#A06B0A'],
  ['#0EA5A5', '#0B8686']
]

export function tileGradient(name: string): [string, string] {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return GRADS[h % GRADS.length]
}

export function tileGlyph(name: string): string {
  const c = name.trim()[0]
  return c ? c.toUpperCase() : '?'
}

// Human summary of where an extension is assigned, shown on the card's foot
// row. `groups` provides names for the group mode.
export function assignmentSummary(ext: ExtensionWithAssignment, groups: GroupRow[]): string {
  if (!ext.enabled) return 'Disabled'
  switch (ext.assign_mode) {
    case 'all':
      return 'All profiles'
    case 'profiles': {
      const n = ext.profileIds.length
      return n === 0 ? 'Not assigned' : n === 1 ? '1 profile' : `${n} profiles`
    }
    case 'groups': {
      const n = ext.groupIds.length
      if (n === 0) return 'Not assigned'
      const first = groups.find((g) => g.id === ext.groupIds[0])?.name
      if (n === 1) return first ?? '1 group'
      return first ? `${first} + ${n - 1} group${n - 1 > 1 ? 's' : ''}` : `${n} groups`
    }
    default:
      return 'Not assigned'
  }
}

// Which scope icon to show ('group' | 'manual/profiles' | 'all'). Returned as
// a string tag; the component maps it to a lucide/nav icon.
export function scopeIconKind(ext: ExtensionWithAssignment): 'group' | 'manual' | 'all' {
  if (ext.assign_mode === 'groups') return 'group'
  if (ext.assign_mode === 'profiles') return 'manual'
  return 'all'
}
