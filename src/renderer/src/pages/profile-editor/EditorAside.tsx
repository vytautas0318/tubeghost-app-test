// The profile editor's right-hand column (Fingerprint tab only): lock banner,
// launch button, live fingerprint overview, danger zone.
//
// Extracted from ProfileEditor.tsx to keep that file a thin orchestrator.

import * as React from 'react'
import { Play } from 'lucide-react'
import type { ProfileRow } from '@/lib/profiles'
import { Section } from './parts'
import { LockBanner } from './LockBanner'
import { DangerZone } from './DangerZone'
import { OverviewSidebar, type OverviewState } from './OverviewSidebar'

export function EditorAside({
  profile,
  currentUserId,
  canLaunch,
  onOpen,
  canDelete,
  overview,
  onForceUnlocked,
  onDelete
}: {
  profile: ProfileRow
  currentUserId: string | null
  canLaunch: boolean
  // Web has no local engine: raises the "desktop app required" modal.
  onOpen: () => void
  canDelete: boolean
  overview: OverviewState | null
  onForceUnlocked: () => void
  onDelete: () => Promise<void>
}): React.ReactElement {
  return (
    <aside className="space-y-5 sticky top-0 self-start">
      <LockBanner
        profile={profile}
        currentUserId={currentUserId}
        onForceUnlocked={onForceUnlocked}
      />
      <Section title="Browser session">
        <div id="launch-button-anchor" className="flex justify-end">
          {canLaunch ? (
            // Launching runs the local engine, which the browser has no access
            // to. Same substitution as the profiles list: prompt for the
            // desktop app instead of shipping a button that cannot work.
            <button onClick={onOpen} className="row-open">
              <Play className="w-3 h-3" fill="currentColor" />
              Launch
            </button>
          ) : (
            <span className="text-xs text-[var(--t3)]">
              You don&apos;t have permission to launch profiles.
            </span>
          )}
        </div>
      </Section>
      <OverviewSidebar state={overview} />
      {canDelete && <DangerZone onDelete={onDelete} />}
    </aside>
  )
}
