// "New here?" explainer visibility.
//
// Seeded from the per-device pref (whether this user has read it), then owned
// in component state so the header button can re-open it within a session.
// Dismissing — by "Got it" or by toggling the button shut — persists.

import { useState } from 'react'
import { usePrefs } from '@/store/prefs'

export interface UseSimpleGuide {
  open: boolean
  toggle: () => void
  dismiss: () => void
}

export function useSimpleGuide(): UseSimpleGuide {
  const dismissed = usePrefs((s) => s.simpleGuideDismissed)
  const setDismissed = usePrefs((s) => s.setSimpleGuideDismissed)
  const [open, setOpen] = useState(() => !dismissed)

  return {
    open,
    toggle: (): void => {
      if (open) setDismissed(true)
      setOpen((v) => !v)
    },
    dismiss: (): void => {
      setOpen(false)
      setDismissed(true)
    }
  }
}
