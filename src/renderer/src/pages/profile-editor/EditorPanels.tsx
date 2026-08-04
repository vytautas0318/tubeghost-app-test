// The four tab panels of the profile editor.
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
import { NewProfileProxyCard } from './NewProfileProxyCard'
import { NewProfileProxySummary } from './NewProfileProxySummary'
import type { NewProfileProxyState } from './useNewProfileProxy'
import type { OverviewState } from './OverviewSidebar'
import type { FormState } from './types'

export type EditorTab = 'general' | 'proxy' | 'fingerprint' | 'advanced'

// `hidden` (display:none) removes inactive tabs from layout so the
// column-level `space-y-5` rhythm on the active tab is preserved.
const tabBoxCls = (active: boolean): string => (active ? 'space-y-5' : 'hidden')

export interface EditorPanelsProps {
  activeTab: EditorTab
  visitedTabs: Set<EditorTab>
  isNew: boolean
  profile: ProfileRow | null
  form: FormState
  setForm: (f: FormState) => void
  canEdit: boolean
  canSave: boolean
  saving: boolean
  proxyState: NewProfileProxyState
  onSave: () => Promise<void>
  onProfileSaved: (p: ProfileRow) => void
  onReload: () => void
  onOverviewChange: (s: OverviewState) => void
  setActiveTab: (t: EditorTab) => void
  navigateGuarded: (to: string) => void
}

export function EditorPanels(props: EditorPanelsProps): React.ReactElement {
  const {
    activeTab,
    visitedTabs,
    isNew,
    profile,
    form,
    setForm,
    canEdit,
    canSave,
    saving,
    proxyState,
    onSave,
    onProfileSaved,
    onReload,
    onOverviewChange,
    setActiveTab,
    navigateGuarded
  } = props

  return (
    <>
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
                  onManageAuth={() => navigateGuarded('/authenticator')}
                  onManagePhone={() => navigateGuarded('/phone')}
                />
              ) : (
                // New profile: surface the proxy that will be attached on
                // save so the auto-assignment is never a silent surprise.
                <NewProfileProxySummary
                  state={proxyState}
                  onConfigure={() => setActiveTab('proxy')}
                />
              )
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
                onProfileSaved(updated)
                onReload()
              }}
            />
          ) : (
            <NewProfileProxyCard state={proxyState} canEdit={canSave} />
          )}
        </div>
      )}

      {visitedTabs.has('fingerprint') && (
        <div className={tabBoxCls(activeTab === 'fingerprint')}>
          {!isNew && profile ? (
            <FingerprintCard
              profile={profile}
              onSaved={onReload}
              onFormChange={onOverviewChange}
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
            <AdvancedCard profile={profile} onSaved={onReload} />
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
