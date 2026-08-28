import * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { useProfileEditorData } from './profile-editor/useProfileEditorData'
import { EditorHeader } from './profile-editor/EditorHeader'
import { type OverviewState } from './profile-editor/OverviewSidebar'
import { Tab } from './profile-editor/parts'
import { DirtyProvider, useDirtyGuard, useDirtyParent } from './profile-editor/DirtyContext'
import { rowToForm } from './profile-editor/types'
import { SimplePanel } from './profile-editor/SimplePanel'
import { useSimpleDraft } from './profile-editor/useSimpleDraft'
import type { ProxyRow } from '@/lib/proxies'
import { useEditorSave } from './profile-editor/useEditorSave'
import { useDraftProfile } from './profile-editor/useDraftProfile'
import { AdvancedPanels, type EditorTab } from './profile-editor/AdvancedPanels'
import { EditorAside } from './profile-editor/EditorAside'
import { ViewModeToggle } from './profile-editor/ViewModeToggle'
import { GuideButton } from './profile-editor/GuideButton'
import { useSimpleGuide } from './profile-editor/useSimpleGuide'
import { GuidedCreate } from './profile-editor/GuidedCreate'
import { CreateModeTabs } from './profile-editor/CreateModeTabs'
import { useCreateMode } from './profile-editor/useCreateMode'
import { usePrefs, type ProfileView } from '@/store/prefs'
import { useAuth } from '@/store/auth'
import { ToastView, useToast } from '@/components/Toast'
import { DesktopAppModal } from '@/components/DesktopAppModal'

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
  const canLaunch = useHasPermission('profiles.launch')
  const canDelete = useHasPermission('profiles.delete')
  const canSave = isNew ? canCreate : canEdit
  const currentUserId = useAuth((s) => s.user?.id ?? null)

  // Simple vs Advanced editor. Seeded once from the stored default and owned
  // by this component thereafter (same contract as the Profiles list): an
  // in-session switch never rewrites the pref. Both modes render the SAME
  // `form` state, so toggling cannot discard unsaved edits.
  const guide = useSimpleGuide()

  const storedView = usePrefs((s) => s.defaultProfileView)

  const create = useCreateMode(isNew, workspace?.workspace_id ?? null, storedView)
  const { detail, assignProxy, freeProxies } = create
  const [mode, setMode] = useState<ProfileView>(() => storedView)

  // Simple-mode draft. Tracks which fields the user actually operated so
  // saving writes only those — see useSimpleDraft for the guarantee.
  const simple = useSimpleDraft(profile)

  // Proxy chosen on the CREATE screen, before a row exists to attach it to.
  // assignProxyToProfile() needs a profile id, so on a new profile we hold the
  // pick here and useEditorSave attaches it right after the insert. It stays
  // out of the Simple draft on purpose — the draft is field patches, whereas
  // proxy assignment owns encrypted credentials and the TubeProxies link
  // (see useSimpleDraft's header).
  const [pendingProxy, setPendingProxy] = useState<ProxyRow | null>(null)

  // Advanced on a NEW profile: create the row up front so Proxy / Fingerprint
  // / Advanced are editable in the same pass as General, instead of showing
  // "Save to unlock". The row is a draft until the user saves — hidden from
  // the list, outside the plan limit — and is discarded if they leave without
  // saving. Simple mode doesn't need this: its tiles patch a draft object and
  // only the proxy pick needs a row, which pendingProxy already covers.
  // Name is deliberately '' to match the blank General form: generalDirty
  // diffs form against the row, so seeding the row with a placeholder name
  // would make a freshly-opened editor look dirty and always prompt on Cancel.
  // The user's real name is written to the row by save().
  const draftProfile = useDraftProfile({
    enabled: isNew && mode === 'advanced',
    workspaceId: workspace?.workspace_id ?? null,
    name: '',
    // Carry Simple's platform choice into the draft row Advanced reads, so the
    // two modes agree instead of each falling back to its own default.
    platform: simple.draft.platform
  })

  // From here on the auto-created draft IS the profile being edited, so every
  // card sees a real row and the `!isNew && profile` gates open.
  const editing = profile ?? draftProfile.draft
  // Cards are gated on "is there a row to write to?", not on "is the URL /new".
  const rowExists = !!editing

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
  // Toast surface for launch errors (lock-held, proxy-precheck,
  // egress-mismatch, engine-crashed). Without this, LaunchButton's
  // onToast?. calls were no-ops and click→nothing-visible.
  const { toast, show: showToast } = useToast()
  // Launching needs the local engine, which the browser doesn't have — prompt
  // for the desktop app instead. (The Profiles list additionally flags an
  // expired proxy before this; it loads the workspace proxy rows, which this
  // page does not.)
  const [openPrompt, setOpenPrompt] = useState<string | null>(null)

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
  // `editing` rather than `profile` so an auto-created draft's General edits
  // also count as dirty — otherwise leaving the editor wouldn't warn about them.
  const generalDirty = editing
    ? JSON.stringify(form) !== JSON.stringify(rowToForm(editing))
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

  // The desktop app refreshes this row when a launch finishes or changes
  // phase (window.api.profiles.onExited / onPhase). There is no local engine
  // here, so there are no launch events to listen for.

  // Save closes the editor on success and returns to the Profiles list.
  // Cancel handles the same nav for the unsaved path; this gives users
  // one consistent "I'm done with this profile" exit instead of three.
  //
  // Flushes every tab's pending edits — each card registers a saver via
  // useRegisterSaver, and we run them sequentially BEFORE the General
  // save. Parallel would race because they all UPDATE the same row.
  // Card savers don't trigger reloads; data.save below returns the
  // fully-updated row, so a single state set re-hydrates every form.
  const onSave = useEditorSave({
    mode,
    isNew,
    id,
    profile,
    workspaceId: workspace?.workspace_id ?? null,
    simple,
    assignProxy,
    pendingProxy,
    draftProfile: draftProfile.draft,
    onDraftCommitted: draftProfile.markCommitted,
    dirty,
    data,
    save,
    navigate
  })

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
  const showAside = mode === 'advanced' && activeTab === 'fingerprint' && rowExists

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      <EditorHeader
        isNew={isNew}
        profile={profile}
        saving={saving}
        canSave={canSave}
        onSave={onSave}
        onLeave={guardedNavigate}
        helpButton={
          mode === 'simple' ? <GuideButton open={guide.open} onToggle={guide.toggle} /> : null
        }
        modeToggle={
          isNew ? (
            <CreateModeTabs
              detail={detail}
              onDetail={(d) => {
                create.setDetail(d)
                // Simple/Advanced share the editor body, so keep `mode` in
                // step; Guided owns its own body and leaves it alone.
                if (d !== 'guided') setMode(d)
              }}
            />
          ) : (
            <ViewModeToggle value={mode} onChange={setMode} />
          )
        }
      />

      {mode === 'advanced' && (
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
      )}

      <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
        {error && (
          <div
            className={
              (showAside ? 'max-w-5xl' : 'max-w-[860px]') +
              ' mx-auto mb-5 text-xs text-[var(--red)] bg-[var(--red-soft)] border border-[var(--red)]/20 rounded-[var(--r)] px-3 py-2 flex items-start gap-2'
            }
          >
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
          {/* min-w-0: a grid item defaults to min-width:auto, so it can't shrink
              below its content. Without it the Simple card trio (three tiles
              with a 200px minimum + gaps) sets an intrinsic floor and renders
              at a different width from the full-width tiles below it. */}
          <div className={(showAside ? 'col-span-2 space-y-5' : 'space-y-5') + ' min-w-0'}>
            {isNew && detail === 'guided' ? (
              <GuidedCreate
                draft={simple.draft}
                patch={simple.patch}
                workspaceId={workspace?.workspace_id ?? null}
                unassignedProxies={freeProxies}
                assignProxy={assignProxy}
                onAssignProxyChange={create.setAssignProxy}
                onCancel={() => guardedNavigate('/profiles')}
                onCreate={() => void onSave()}
                creating={saving}
              />
            ) : mode === 'simple' ? (
              <SimplePanel
                profile={profile}
                simple={simple}
                workspaceId={workspace?.workspace_id ?? null}
                canEdit={canEdit}
                onToast={showToast}
                onOpenAdvanced={() => setMode('advanced')}
                onOrderNumber={() => guardedNavigate('/phone?buy=1')}
                onProfileSaved={(pr) => data.setProfile(pr)}
                pendingProxy={pendingProxy}
                onPendingProxyChange={setPendingProxy}
                guideOpen={guide.open}
                onDismissGuide={guide.dismiss}
              />
            ) : (
              <AdvancedPanels
                activeTab={activeTab}
                visitedTabs={visitedTabs}
                // A draft row counts as existing: the cards can write to it, so
                // they render live instead of "Save to unlock".
                isNew={!rowExists}
                profile={editing}
                form={form}
                setForm={setForm}
                canEdit={canEdit}
                canSave={canSave}
                saving={saving}
                onSave={onSave}
                setActiveTab={setActiveTab}
                guardedNavigate={guardedNavigate}
                data={data}
                setOverview={setOverview}
              />
            )}
          </div>
          {showAside && editing && (
            <EditorAside
              profile={editing}
              currentUserId={currentUserId}
              canLaunch={canLaunch}
              canDelete={canDelete}
              overview={overview}
              onForceUnlocked={() => void data.reload?.()}
              onDelete={onDelete}
              onOpen={() => setOpenPrompt(profile?.name ?? 'this profile')}
            />
          )}
        </div>
      </div>
      {openPrompt !== null && (
        <DesktopAppModal profileName={openPrompt} onClose={() => setOpenPrompt(null)} />
      )}
      <ToastView toast={toast} />
    </div>
  )
}
