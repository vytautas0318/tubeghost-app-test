// Static config for the Authenticator page. Live data + real TOTP come from
// lib/authenticator (Supabase + the totp Edge Function) via useAuthData; tag
// colors now come from the shared workspace tag registry (lib/tags.ts +
// useWorkspaceTags) so this file no longer holds a tag list.
import type { AuthPlatform } from '@/lib/authenticator'

export { PERIOD } from './useAuthData'

// Brand-tile platform → display issuer, used as a default when enrolling.
export const PLATFORM_ISSUER: Record<AuthPlatform, string> = {
  yt: 'YouTube',
  ig: 'Instagram',
  tt: 'TikTok',
  x: 'X',
  fb: 'Facebook',
  am: 'Amazon',
  other: 'Account'
}

// Placeholder store URLs for the "Get the app" menu (§6). Swap for the real
// listings when the mobile apps ship.
export const APP_STORE_URL = 'https://apps.apple.com/app/tubeghost-authenticator'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.tubeghost.authenticator'
