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
  openByOther?: { initials: string; device: string }
}

function deriveStatus(p: ProfileRow): DerivedStatus {
  if (p.open_session_id) return 'open'
  return 'idle'
}

export function toView(
  p: ProfileRow,
  currentUserId: string | null,
  groupNames?: Map<string, string>
): ViewProfile {
  const heldByOther =
    p.open_session_id && p.open_by_user_id && p.open_by_user_id !== currentUserId
  const groupLabel = p.group_id ? groupNames?.get(p.group_id) ?? '—' : '—'
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
          initials: (p.open_by_user_id ?? '?').slice(0, 2).toUpperCase(),
          device: p.open_by_device ?? 'unknown'
        }
      : undefined
  }
}
