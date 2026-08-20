import { formatDistanceToNow } from 'date-fns'
import type { ProfileRow } from '@/lib/profiles'

export type DerivedStatus = 'open' | 'idle' | 'error'

export interface ViewProfile {
  id: string
  number: number | null
  name: string
  status: DerivedStatus
  group: string
  proxyIp: string
  proxyPort: number | null
  geo: string
  lastOpened: string
  tags: string[]
  // Who currently holds the concurrent-open lock, when it isn't you.
  // `name` is the member's display name (or email) — NOT the device. The
  // device is the machine's hostname and is shown alongside, because "In use
  // on Admin" alone reads like a role rather than someone's computer.
  openByOther?: { initials: string; device: string; name: string | null }
}

// "Vytautas Briauka" → "VB"; "kjell@x.com" → "KJ". Falls back to "?" so the
// badge still renders when the name can't be resolved (e.g. the holder left
// the workspace).
function initialsOf(name: string | null): string {
  if (!name) return '?'
  const parts = name
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function deriveStatus(p: ProfileRow): DerivedStatus {
  if (p.open_session_id) return 'open'
  return 'idle'
}

export function toView(
  p: ProfileRow,
  currentUserId: string | null,
  groupNames?: Map<string, string>,
  // user_id → display name/email, for naming the lock holder.
  userNames?: Map<string, string>
): ViewProfile {
  const heldByOther = p.open_session_id && p.open_by_user_id && p.open_by_user_id !== currentUserId
  const groupLabel = p.group_id ? (groupNames?.get(p.group_id) ?? '—') : '—'
  return {
    id: p.id,
    number: p.profile_number,
    name: p.name,
    status: deriveStatus(p),
    group: groupLabel,
    proxyIp: p.proxy_host ?? '',
    proxyPort: p.proxy_port,
    geo: p.timezone || '—',
    lastOpened: p.last_opened_at
      ? formatDistanceToNow(new Date(p.last_opened_at), { addSuffix: true })
      : 'never',
    tags: p.tags ?? [],
    openByOther: heldByOther
      ? {
          // Initials from the real NAME. Previously this sliced the first two
          // characters off a UUID, so the badge showed meaningless letters.
          initials: initialsOf(userNames?.get(p.open_by_user_id ?? '') ?? null),
          device: p.open_by_device ?? 'unknown',
          name: userNames?.get(p.open_by_user_id ?? '') ?? null
        }
      : undefined
  }
}
