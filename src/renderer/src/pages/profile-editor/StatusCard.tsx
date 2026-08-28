import * as React from 'react'
import type { ProfileRow } from '@/lib/profiles'
import { Section } from './parts'

export function StatusCard({ profile }: { profile: ProfileRow }): React.ReactElement {
  return (
    <Section title="Status" labelStyle>
      <div className="space-y-2">
        {profile.open_session_id ? (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--green)] pulse-soft" />
            <span className="text-sm font-medium text-[var(--t1)]">Currently open</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-night-muted" />
            <span className="text-sm font-medium text-[var(--t2)]">Idle</span>
          </div>
        )}
        {profile.last_known_egress_ip && (
          <div className="text-[11px] text-[var(--t3)]">
            Last egress IP: <code className="mono">{profile.last_known_egress_ip}</code>
          </div>
        )}
        {/* The desktop app offers "View engine logs" here. There is no local
            engine — and no logs — in the browser, so the action is omitted. */}
      </div>
    </Section>
  )
}
