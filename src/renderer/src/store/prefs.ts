// Personal/DEVICE appearance preferences: accent color + compact density +
// desktop notifications. Never synced to teammates — persisted to localStorage,
// exactly like store/theme.ts (theme lives there; these are the rest of §3
// "Appearance"). Applied to <html> at runtime so no rebuild/CSS edit is needed.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Accent presets from §3. Each maps the brand-red ramp to a new hue; because
// every component references var(--red)/var(--red-soft)/var(--red-hover), we
// only need to override those four on documentElement to re-skin the primary
// color app-wide.
export interface Accent {
  key: string
  base: string
  hover: string
  soft: string
  soft2: string
  // "r, g, b" triple of `base`, exposed as --red-rgb so shadow/glow tokens can
  // rebuild rgba(...) at any alpha and still follow the accent (see ds-tokens).
  rgb: string
}

export const ACCENTS: Accent[] = [
  {
    key: 'red',
    base: '#EF0039',
    hover: '#D82822',
    soft: 'rgba(239,0,57,0.08)',
    soft2: 'rgba(239,0,57,0.14)',
    rgb: '239, 0, 57'
  },
  {
    key: 'purple',
    base: '#7C3AED',
    hover: '#6D28D9',
    soft: 'rgba(124,58,237,0.08)',
    soft2: 'rgba(124,58,237,0.14)',
    rgb: '124, 58, 237'
  },
  {
    key: 'green',
    base: '#16A06A',
    hover: '#12855A',
    soft: 'rgba(22,160,106,0.08)',
    soft2: 'rgba(22,160,106,0.14)',
    rgb: '22, 160, 106'
  },
  {
    key: 'blue',
    base: '#2563EB',
    hover: '#1D4FD7',
    soft: 'rgba(37,99,235,0.08)',
    soft2: 'rgba(37,99,235,0.14)',
    rgb: '37, 99, 235'
  }
]

// Which Profiles view the app opens on. 'simple' is the card grid (the default
// — non-technical users are the majority), 'advanced' the full table. This is
// the STORED DEFAULT only: toggling the view inside a session is held in React
// state and deliberately never written back here, so a temporary look at the
// table doesn't silently change what the app opens on next launch.
export type ProfileView = 'simple' | 'advanced'

interface PrefsState {
  accent: string // Accent.key
  compactDensity: boolean
  desktopNotifications: boolean
  defaultProfileView: ProfileView
  // Simple editor's "New here?" explainer. Shown until the user dismisses it;
  // the header button re-opens it afterwards. Per-device, like the rest here.
  simpleGuideDismissed: boolean
  setAccent: (key: string) => void
  setCompactDensity: (v: boolean) => void
  setDesktopNotifications: (v: boolean) => void
  setDefaultProfileView: (v: ProfileView) => void
  setSimpleGuideDismissed: (v: boolean) => void
}

function applyAccent(key: string): void {
  const a = ACCENTS.find((x) => x.key === key) ?? ACCENTS[0]
  const root = document.documentElement
  // 'red' = the built-in ds-tokens.css default: clear overrides so the token
  // sheet (and its dark-mode variants) win untouched.
  if (a.key === 'red') {
    for (const v of ['--red', '--red-hover', '--red-soft', '--red-soft-2', '--red-rgb'])
      root.style.removeProperty(v)
    return
  }
  root.style.setProperty('--red', a.base)
  root.style.setProperty('--red-hover', a.hover)
  root.style.setProperty('--red-soft', a.soft)
  root.style.setProperty('--red-soft-2', a.soft2)
  root.style.setProperty('--red-rgb', a.rgb)
}

function applyDensity(compact: boolean): void {
  document.documentElement.setAttribute('data-density', compact ? 'compact' : 'cozy')
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      accent: 'red',
      compactDensity: false,
      desktopNotifications: true,
      defaultProfileView: 'simple',
      simpleGuideDismissed: false,
      setAccent: (key): void => {
        applyAccent(key)
        set({ accent: key })
      },
      setCompactDensity: (v): void => {
        applyDensity(v)
        set({ compactDensity: v })
      },
      setDesktopNotifications: (v): void => {
        set({ desktopNotifications: v })
      },
      setDefaultProfileView: (v): void => {
        set({ defaultProfileView: v })
      },
      setSimpleGuideDismissed: (v): void => {
        set({ simpleGuideDismissed: v })
      }
    }),
    {
      name: 'tpb-prefs',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyAccent(state.accent)
          applyDensity(state.compactDensity)
        }
      }
    }
  )
)
