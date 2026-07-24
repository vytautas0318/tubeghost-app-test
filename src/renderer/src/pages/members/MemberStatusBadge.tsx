import * as React from 'react'
import { Badge, type BadgeTone } from '@/components/ui'
import type { MemberStatus } from './types'

const STATUS_META: Record<MemberStatus, { tone: BadgeTone; label: string }> = {
  active: { tone: 'green', label: 'Active' },
  pending: { tone: 'amber', label: 'Pending' },
  disabled: { tone: 'neutral', label: 'Disabled' },
  removed: { tone: 'red', label: 'Removed' }
}

// Small lifecycle badge for a workspace member. Reuses the DS Badge.
export function MemberStatusBadge({ status }: { status: MemberStatus }): React.ReactElement {
  const meta = STATUS_META[status] ?? STATUS_META.active
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}
