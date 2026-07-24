import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  toggle: () => void
  set: (t: Theme) => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggle: (): void => {
        const next: Theme = get().theme === 'light' ? 'dark' : 'light'
        applyTheme(next)
        set({ theme: next })
      },
      set: (t: Theme): void => {
        applyTheme(t)
        set({ theme: t })
      }
    }),
    {
      name: 'tpb-theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      }
    }
  )
)

function applyTheme(t: Theme): void {
  const root = document.documentElement
  // Drive both signals: `.dark` for Tailwind `dark:` utilities, `data-theme`
  // for the TubeGhost Design System token switch (ds-tokens.css).
  root.classList.toggle('dark', t === 'dark')
  root.setAttribute('data-theme', t)
}
