// Part option lists + types for the composable GhostAvatar. Kept in a
// non-component module so GhostAvatar.tsx stays a components-only file (React
// Fast Refresh requirement). Shared by GhostAvatar, AvatarPicker, lib/avatar.

export type GhostFace = 'neutral' | 'happy' | 'wink' | 'surprised'
export type GhostGlasses = 'round' | 'square' | 'none'
export type GhostHat = 'none' | 'cap' | 'beanie' | 'crown' | 'party'
export type GhostHand = 'none' | 'thumbsup' | 'peace' | 'wave' | 'fist'

export const GHOST_COLORS = ['#F0322E', '#7C3AED', '#2563EB', '#16A06A', '#C2820C', '#18181B']
export const GHOST_FACES: GhostFace[] = ['neutral', 'happy', 'wink', 'surprised']
export const GHOST_GLASSES: GhostGlasses[] = ['round', 'square', 'none']
export const GHOST_HATS: GhostHat[] = ['none', 'cap', 'beanie', 'crown', 'party']
export const GHOST_HANDS: GhostHand[] = ['none', 'thumbsup', 'peace', 'wave', 'fist']
