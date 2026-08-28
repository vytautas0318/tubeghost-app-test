// The four Advanced tab panels of the profile editor.
//
// Extracted from ProfileEditor.tsx so that file stays a thin orchestrator
// (250-line cap). Every VISITED tab stays mounted and is hidden with
// Tailwind's `hidden` when inactive, so in-progress edits survive tab
// switches and the header Save can flush them together.

import * as React from 'react'
import type { ProfileRow } from '@/lib/profiles'
import { IdentityCard } from './IdentityCard'
import { FingerprintCard } from './FingerprintCard'
import { AdvancedCard } from './AdvancedCard'
import { ProxyCard } from './ProxyCard'
import { LinkedCredentials } from './LinkedCredentials'
import { SaveToUnlockCard } from './SaveToUnlockCard'
import type { OverviewState } from './OverviewSidebar'
import type { FormState } from './types'

export type EditorTab = 'general' | 'proxy' | 'fingerprint' | 'advanced'

// `hidden` (display:none) removes inactive tabs from layout so the
// column-level `space-y-5` rhythm on the active tab is preserved.
const tabBoxCls = (active: boolean): string => (active ? 'space-y-5' : 'hidden')

export function AdvancedPanels({
  activeTab,
  visitedTabs,
  isNew,
  profile,
  form,
  setForm,
  canEdit,
  canSave,
  saving,
  onSave,
  setActiveTab,
  guardedNavigate,
  data,
  setOverview
}: {
  activeTab: EditorTab
  visitedTabs: Set<EditorTab>
  isNew: boolean
  profile: ProfileRow | null
  form: FormState
  setForm: (f: FormState) => void
  canEdit: boolean
  canSave: boolean
  saving: boolean
  onSave: () => Promise<void>
  setActiveTab: (t: EditorTab) => void
  guardedNavigate: (to: string) => void
  data: { setProfile: (p: ProfileRow) => void; reload?: () => Promise<void> }
  setOverview: (s: OverviewState) => void
}): React.ReactElement {
  return (
    <>
      {/*
            Each visited tab stays mounted (hidden via Tailwind `hidden`
            when inactive) so the user's in-progress edits survive tab
            switches and get flushed together by the top-right Save.
            `display:none` keeps the card's saver registered AND keeps
            its local form state intact.
          */}
      {visitedTabs.has('general') && (
        <div className={tabBoxCls(activeTab === 'general')}>
          <IdentityCard
            form={form}
            onChange={setForm}
            footer={
              !isNew && profile ? (
                <LinkedCredentials
                  embedded
                  proxyHost={profile.proxy_host}
                  onManageProxy={() => setActiveTab('proxy')}
                  onManageAuth={() => guardedNavigate('/authenticator')}
                  onManagePhone={() => guardedNavigate('/phone')}
                />
              ) : null
            }
          />
        </div>
      )}
      {visitedTabs.has('proxy') && (
        <div className={tabBoxCls(activeTab === 'proxy')}>
          {!isNew && profile ? (
            <ProxyCard
              profile={profile}
              canEdit={canEdit}
              onSaved={(updated) => {
                data.setProfile(updated)
                void data.reload?.()
              }}
            />
          ) : (
            <SaveToUnlockCard
              title="Proxy"
              body="Per-profile proxy assignment is stored on the profile row. Save now to enable it — your General-tab inputs are kept."
              saving={saving}
              canSave={canSave}
              onSave={onSave}
            />
          )}
        </div>
      )}
      {visitedTabs.has('fingerprint') && (
        <div className={tabBoxCls(activeTab === 'fingerprint')}>
          {!isNew && profile ? (
            <FingerprintCard
              profile={profile}
              onSaved={() => void data.reload?.()}
              onFormChange={(f) => setOverview(f)}
            />
          ) : (
            <SaveToUnlockCard
              title="Fingerprint"
              body="Fingerprint values are seeded automatically when the profile is created. Save now to start editing them — your General-tab inputs are kept."
              saving={saving}
              canSave={canSave}
              onSave={onSave}
            />
          )}
        </div>
      )}
      {visitedTabs.has('advanced') && (
        <div className={tabBoxCls(activeTab === 'advanced')}>
          {!isNew && profile ? (
            <AdvancedCard profile={profile} onSaved={() => void data.reload?.()} />
          ) : (
            <SaveToUnlockCard
              title="Advanced"
              body="Advanced settings (port-scan protection, custom launch args, locale overrides) are stored on the profile row. Save now to enable them — your General-tab inputs are kept."
              saving={saving}
              canSave={canSave}
              onSave={onSave}
            />
          )}
        </div>
      )}
    </>
  )
}
