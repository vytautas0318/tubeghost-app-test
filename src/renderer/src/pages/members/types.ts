// Shared types + small helpers for the Members page sub-components.

import type { AvatarConfig } from '@/lib/avatar'

export type MemberStatus = 'pending' | 'active' | 'disabled' | 'removed'

export interface MemberRow {
  user_id: string
  joined_at: string
  invited_by: string | null
  status: MemberStatus
  last_seen_at: string | null
}

export interface UserRoleRow {
  user_id: string
  role_id: string
  workspace_id: string
}

export interface AppRoleRow {
  id: string
  name: string
  hierarchy: number
  color: string | null
  is_default: boolean
}

export interface ViewMember {
  userId: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  // Normalized ghost-avatar config (always complete — defaulted). Rendered as
  // the member's GhostAvatar, matching the sidebar.
  avatarConfig: AvatarConfig
  joinedAt: string
  joinedAtRelative: string
  roleId: string | null
  roleName: string
  roleHierarchy: number | null
  roleColor: string | null
  status: MemberStatus
  lastSeenRelative: string | null
}

export type SortKey = 'role' | 'name' | 'lastSeen' | 'joined'
export type StatusFilter = 'all' | MemberStatus

export function shortId(uuid: string): string {
  return uuid.slice(0, 8)
}

// "redditsconfessions@gmail.com" → "redditsconfessions"
export function localPart(email: string | null): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  return at === -1 ? email : email.slice(0, at)
}
