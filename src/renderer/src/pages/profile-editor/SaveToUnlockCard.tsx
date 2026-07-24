import * as React from 'react'
import { Save } from 'lucide-react'
import { Section } from './parts'

// Shown on tabs that read/write columns on a saved profile row (Proxy,
// Fingerprint, Advanced) for brand-new profiles: a one-click Save inside the
// tab so the user doesn't bounce to the header Save and back. After save the
// tab re-renders with the real card automatically.
export function SaveToUnlockCard({
  title,
  body,
  saving,
  canSave,
  onSave
}: {
  title: string
  body: string
  saving: boolean
  canSave: boolean
  onSave: () => Promise<void> | void
}): React.ReactElement {
  return (
    <Section title={title}>
      <div className="space-y-3 text-sm text-[var(--t2)]">
        <p>{body}</p>
        <button
          onClick={() => void onSave()}
          disabled={!canSave || saving}
          title={!canSave ? "You don't have permission to create profiles" : undefined}
          className="px-3 py-1.5 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : `Save profile to edit ${title}`}
        </button>
      </div>
    </Section>
  )
}
