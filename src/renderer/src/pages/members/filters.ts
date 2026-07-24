// Pure search / filter / sort for the members list. Kept out of the render
// path so it's trivially testable and the page stays thin.

import { localPart } from './types'
import type { SortKey, StatusFilter, ViewMember } from './types'

export function filterAndSortMembers(
  members: ViewMember[],
  query: string,
  status: StatusFilter,
  sort: SortKey
): ViewMember[] {
  const q = query.trim().toLowerCase()
  const filtered = members.filter((m) => {
    if (status !== 'all' && m.status !== status) return false
    if (!q) return true
    const hay = [m.displayName, m.email, localPart(m.email), m.roleName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  const sorted = filtered.slice()
  sorted.sort((a, b) => {
    switch (sort) {
      case 'name': {
        const an = (a.displayName ?? localPart(a.email) ?? '').toLowerCase()
        const bn = (b.displayName ?? localPart(b.email) ?? '').toLowerCase()
        return an.localeCompare(bn)
      }
      case 'joined':
        return b.joinedAt.localeCompare(a.joinedAt) // newest first
      case 'lastSeen': {
        // Members with a last-seen come first; unknown sinks to the bottom.
        if (!a.lastSeenRelative && !b.lastSeenRelative) return 0
        if (!a.lastSeenRelative) return 1
        if (!b.lastSeenRelative) return -1
        return 0
      }
      case 'role':
      default: {
        const ah = a.roleHierarchy ?? 999
        const bh = b.roleHierarchy ?? 999
        if (ah !== bh) return ah - bh
        return a.joinedAt.localeCompare(b.joinedAt)
      }
    }
  })
  return sorted
}
