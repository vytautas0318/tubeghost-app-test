// Ghost-avatar config persistence. The composable avatar (color + expression
// + glasses + hat + gesture — see components/GhostAvatar.tsx) is stored as a
// small JSON blob on auth.users.raw_user_meta_data->>'avatar_config' via
// supabase.auth.updateUser({ data }). No storage bucket, no table: it syncs
// across devices and updateUser fires a USER_UPDATED auth event that the auth
// store already listens for, so every GhostAvatar re-renders after a save.

import type { User } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import {
  GHOST_COLORS,
  type GhostFace,
  type GhostGlasses,
  type GhostHat,
  type GhostHand
} from '@/components/ghost-avatar-parts'

export interface AvatarConfig {
  color: string
  face: GhostFace
  glasses: GhostGlasses
  hat: GhostHat
  hand: GhostHand
}

export const DEFAULT_AVATAR: AvatarConfig = {
  color: GHOST_COLORS[0],
  face: 'neutral',
  glasses: 'round',
  hat: 'none',
  hand: 'none'
}

// Normalize a raw avatar_config blob into a complete config, falling back to
// the default for a missing/partial/legacy value. Works from any source: the
// current user's metadata (readAvatarConfig) or another member's config
// surfaced by the get_workspace_user_details RPC (Members page).
export function avatarConfigFrom(raw: Partial<AvatarConfig> | null | undefined): AvatarConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_AVATAR
  return {
    color: typeof raw.color === 'string' ? raw.color : DEFAULT_AVATAR.color,
    face: raw.face ?? DEFAULT_AVATAR.face,
    glasses: raw.glasses ?? DEFAULT_AVATAR.glasses,
    hat: raw.hat ?? DEFAULT_AVATAR.hat,
    hand: raw.hand ?? DEFAULT_AVATAR.hand
  }
}

// Read the saved config off a user's metadata, falling back to the default for
// a user who hasn't customized theirs. Tolerant of partial/legacy blobs.
export function readAvatarConfig(user: User | null | undefined): AvatarConfig {
  const raw = (user?.user_metadata as { avatar_config?: Partial<AvatarConfig> } | undefined)
    ?.avatar_config
  return avatarConfigFrom(raw)
}

// Persist the config to user metadata. The auth store's onAuthStateChange
// handler receives the USER_UPDATED event and refreshes `user`, so callers
// don't need to manually update local state.
export async function saveAvatarConfig(config: AvatarConfig): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.auth.updateUser({ data: { avatar_config: config } })
  if (error) throw error
}
