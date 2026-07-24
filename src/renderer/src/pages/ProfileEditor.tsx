import * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { Tab } from './profile-editor/parts'
import { useProfileEditorData } from './profile-editor/useProfileEditorData'
import { EditorHeader } from './profile-editor/EditorHeader'
import { IdentityCard } from './profile-editor/IdentityCard'
import { FingerprintCard } from './profile-editor/FingerprintCard'
import { DangerZone } from './profile-editor/DangerZone'
import { AdvancedCard } from './profile-editor/AdvancedCard'
import { ProxyCard } from './profile-editor/ProxyCard'
import { LinkedCredentials } from './profile-editor/LinkedCredentials'
import { SaveToUnlockCard } from './profile-editor/SaveToUnlockCard'
import { OverviewSidebar, type OverviewState } from './profile-editor/OverviewSidebar'
import { DirtyProvider, useDirtyGuard, useDirtyParent } from './profile-editor/DirtyContext'
import { rowToForm } from './profile-editor/types'
import { ToastView, useToast } from '@/components/Toast'

type EditorTab = 'general' | 'proxy' | 'fingerprint' | 'advanced'

// `hidden` (display:none) removes inactive tabs from layout so the
// column-level `space-y-5` rhythm on the active tab is preserved.
// space-y-5 inside the box stacks multiple cards (IdentityCard +
// CookiesCard on General).
const tabBoxCls = (active: boolean): string =>
  active ? 'space-y-5' : 'hidden'

export function ProfileEditor(): React.ReactElement {
  // Wrap in DirtyProvider so child cards can register their dirty
  // state and the inner component can intercept tab + route changes.
  return (
    <DirtyProvider>
      <ProfileEditorInner />
    </DirtyProvider>
  )
}

function ProfileEditorInner(): React.ReactElement {
  const { id } = useParams()
  const navigate = useNavigate()
  const workspace = useWorkspace((s) => s.current)
  const isNew = !id || id === 'new'

  const data = useProfileEditorData(id, isNew)
  const { profile, form, setForm, loading, saving, error, save, remove } = data

  const canCreate = useHasPermission('profiles.create')
  const canEdit = useHasPermission('profiles.edit')
  const canDelete = useHasPermission('profiles.delete')
  const canSave = isNew ? canCreate : canEdit

  const [activeTab, setActiveTabRaw] = useState<EditorTab>('general')
  // Tabs are mounted lazily on first visit and STAY mounted afterwards
  // (hidden via CSS when inactive). This lets the user edit on one tab,
  // switch to another, and have the top-right Save flush every tab's
  // dirty state in one click — without losing the off-tab edits to an
  // unmount. Avoids the upfront cost of mounting tabs the user never
  // opens (e.g. their proxy pool fetch).
  const [visitedTabs, setVisitedTabs] = useState<Set<EditorTab>>(
    () => new Set<EditorTab>(['general'])
  )
  // Live derived state for the Overview sidebar — updated by the
  // Fingerprint card on every keystroke so the sidebar reflects
  // pending edits before save.
  const [overview, setOverview] = useState<OverviewState | null>(null)
  const { toast } = useToast()

  // Cards register their dirty state via useDirtyGuard so we can warn
  // on route-leave, and register savers via useRegisterSaver so the
  // top-right Save can flush every tab at once.
  const dirty = useDirtyParent()
  const setActiveTab = (next: EditorTab): void => {
    if (next === activeTab) return
    // No dirty-confirm here: cards stay mounted across switches, so
    // tab navigation no longer risks discarding edits.
    setVisitedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)))
    setActiveTabRaw(next)
  }
  const guardedNavigate = (to: string): void => {
    if (!dirty.confirmIfDirty('leave the editor')) return
    navigate(to)
  }

  // Track the General-tab (IdentityCard) form's dirty state. The
  // FingerprintCard + AdvancedCard register their own via useDirtyGuard.
  const generalDirty = !isNew && profile
    ? JSON.stringify(form) !== JSON.stringify(rowToForm(profile))
    : false
  useDirtyGuard('General', generalDirty)

  // Browser/window close warning. beforeunload only triggers if the
  // page has been interacted with — Electron honors it the same way.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent): void => {
      if (dirty.isAnyDirty()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Save closes the editor on success and returns to the Profiles list.
  // Cancel handles the same nav for the unsaved path; this gives users
  // one consistent "I'm done with this profile" exit instead of three.
  //
  // Flushes every tab's pending edits — each card registers a saver via
  // useRegisterSaver, and we run them sequentially BEFORE the General
  // save. Parallel would race because they all UPDATE the same row.
  // Card savers don't trigger reloads; data.save below returns the
  // fully-updated row, so a single state set re-hydrates every form.
  const onSave = async (): Promise<void> => {
    if (!workspace) return
    if (!isNew) {
      const all = await dirty.runAllSavers()
      if (!all.ok) {
        data.setError(`${all.key}: ${all.error}`)
        return
      }
    }
    const r = await save(workspace.workspace_id, isNew, id)
    if (r) navigate('/profiles')
  }

  const onDelete = async (): Promise<void> => {
    if (isNew || !id) return
    if (!confirm('Delete this profile? This cannot be undone.')) return
    const r = await remove(id)
    if (r.ok) navigate('/profiles', { replace: true })
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--t3)]">
        Loading profile…
      </div>
    )
  }

  // The right sidebar (Browser session / Overview / Danger zone) belongs to the
  // Fingerprint tab only; General / Proxy / Advanced go single-column.
  const showAside = activeTab === 'fingerprint' && !isNew && !!profile

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      <EditorHeader
        isNew={isNew}
        profile={profile}
        saving={saving}
        canSave={canSave}
        onSave={onSave}
        onLeave={guardedNavigate}
      />

      <div className="flex border-b border-[var(--line)] px-6 gap-1">
        <Tab active={activeTab === 'general'} onClick={() => setActiveTab('general')}>
          General
        </Tab>
        <Tab active={activeTab === 'proxy'} onClick={() => setActiveTab('proxy')}>
          Proxy
        </Tab>
        <Tab active={activeTab === 'fingerprint'} onClick={() => setActiveTab('fingerprint')}>
          Fingerprint
        </Tab>
        <Tab active={activeTab === 'advanced'} onClick={() => setActiveTab('advanced')}>
          Advanced
        </Tab>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        {error && (
          <div className={(showAside ? 'max-w-5xl' : 'max-w-[860px]') + ' mx-auto mb-5 text-xs text-[var(--red)] bg-[var(--red-soft)] border border-[var(--red)]/20 rounded-[var(--r)] px-3 py-2 flex items-start gap-2'}>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div
          className={
            'mx-auto grid gap-6 items-start ' +
            (showAside ? 'max-w-5xl grid-cols-3' : 'max-w-[860px] grid-cols-1')
          }
        >
          <div className={showAside ? 'col-span-2 space-y-5' : 'space-y-5'}>
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
          </div>
          {showAside && profile && (
            <aside className="space-y-5 sticky top-0 self-start">
              <OverviewSidebar state={overview} />
              {canDelete && <DangerZone onDelete={onDelete} />}
            </aside>
          )}
        </div>
      </div>
      <ToastView toast={toast} />
    </div>
  )
}

