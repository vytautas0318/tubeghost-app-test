import * as React from 'react'
import { HelpCircle } from 'lucide-react'

/**
 * "New here?" — header toggle for the Simple editor's explainer panel.
 *
 * Closing via this button persists the dismissal, so it means the same thing
 * as the panel's own "Got it".
 */
export function GuideButton({
  open,
  onToggle
}: {
  open: boolean
  onToggle: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      className="sa-help-btn"
      aria-expanded={open}
      aria-controls="sa-guide-panel"
      onClick={onToggle}
    >
      <HelpCircle />
      New here?
    </button>
  )
}
