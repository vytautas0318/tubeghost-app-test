import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission, useFeatureEnabled } from '@/lib/permissions'
import { ToastView, useToast } from '@/components/Toast'
import type { ExtensionWithAssignment } from '@/lib/extensions'
import { useExtensionsData } from './extensions/useExtensionsData'
import { useAddExtension } from './extensions/useAddExtension'
import { ExtensionsHeader } from './extensions/ExtensionsHeader'
import { ExtCard } from './extensions/ExtCard'
import { ExtCardMenu } from './extensions/ExtCardMenu'
import { AssignEditor } from './extensions/AssignEditor'
import { ExtDetails } from './extensions/ExtDetails'
import { BrowseTab } from './extensions/BrowseTab'

type MenuState = { id: string; x: number; y: number; up: boolean }

export function Extensions(): React.ReactElement {
  const ws = useWorkspace((s) => s.current)
  const workspaceId = ws?.workspace_id ?? null

  // Permission ladder (see permMap.ts): read → profiles.view; write →
  // extensions.create/edit; full → extensions.delete. Adding is additionally
  // plan-gated on 'extensions' — RLS enforces the same pair server-side.
  const canView = useHasPermission('profiles.view')
  const canCreate = useHasPermission('extensions.create')
  const canEdit = useHasPermission('extensions.edit')
  const canDelete = useHasPermission('extensions.delete')
  const planEnabled = useFeatureEnabled('extensions')
  const canAdd = canCreate && planEnabled

  const data = useExtensionsData(workspaceId, canView)
  const add = useAddExtension()
  const { toast, show } = useToast()

  const [tab, setTab] = useState<'installed' | 'browse'>('installed')
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [assignFor, setAssignFor] = useState<ExtensionWithAssignment | null>(null)
  const [detailsFor, setDetailsFor] = useState<ExtensionWithAssignment | null>(null)
  const [assignSaving, setAssignSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menu])

  if (!canView) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center text-sm text-[var(--t3)]">
        You don’t have permission to view extensions.
      </div>
    )
  }

  const enabledCount = data.exts.filter((e) => e.enabled).length
  const menuExt = menu && data.exts.find((e) => e.id === menu.id)

  const openMenu = (id: string, rect: DOMRect): void => {
    const up = rect.bottom + 200 > window.innerHeight
    setMenu({ id, x: rect.right - 184, y: up ? rect.top - 6 : rect.bottom + 6, up })
  }

  const onToggle = (id: string, next: boolean): void => {
    void data.toggle(id, next).catch((e: Error) => show('error', e.message))
  }

  const onRemove = (ext: ExtensionWithAssignment): void => {
    if (!window.confirm(`Remove “${ext.name}”? It will be unassigned from all profiles.`)) return
    void data
      .remove(ext.id)
      .then(() => show('success', `${ext.name} removed`))
      .catch((e: Error) => show('error', e.message))
  }

  const onSaveAssign = (a: Parameters<typeof data.assign>[1]): void => {
    if (!assignFor) return
    setAssignSaving(true)
    void data
      .assign(assignFor, a)
      .then(() => {
        show('success', 'Assignment saved')
        setAssignFor(null)
      })
      .catch((e: Error) => show('error', e.message))
      .finally(() => setAssignSaving(false))
  }

  const doAddFromFile = (file: File): void => {
    if (!workspaceId) return
    void add
      .addFromFile(workspaceId, file)
      .then((ext) => {
        data.addLocal(ext)
        setTab('installed')
        show('success', `${ext.name} added`)
      })
      .catch((e: Error) => show('error', e.message))
  }

  const doAddFromWebStore = (urlOrId: string, label: string): void => {
    if (!workspaceId) return
    show('info', `Fetching ${label} from the Web Store…`)
    void add
      .addFromWebStore(workspaceId, urlOrId)
      .then((ext) => {
        data.addLocal(ext)
        setTab('installed')
        show('success', `${ext.name} added`)
      })
      .catch((e: Error) => show('error', `${e.message} — you can upload the .crx instead.`))
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <input
        ref={fileRef}
        type="file"
        accept=".crx,.zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) doAddFromFile(f)
          e.target.value = ''
        }}
      />

      <div className="wrap">
        <ExtensionsHeader
          enabledCount={enabledCount}
          syncedProfiles={data.syncedProfiles}
          canAdd={canAdd}
          busy={add.busy}
          onUploadClick={() => fileRef.current?.click()}
          onWebStoreClick={() => setTab('browse')}
        />

        {/* Permission but no plan → the page is the upsell surface (see
            Sidebar: the nav item stays visible on plans without the feature). */}
        {canCreate && !planEnabled && (
          <div className="mb-5 rounded-[10px] border border-[var(--line)] bg-[var(--hover)] px-4 py-3 text-sm text-[var(--t2)]">
            Extensions are available on the Pro and Team plans. Upgrade to add and assign them.
          </div>
        )}

        <div className="ext-tabs">
          <div
            className={'ext-tab' + (tab === 'installed' ? ' on' : '')}
            onClick={() => setTab('installed')}
          >
            Installed <span className="ext-tab-c">{data.exts.length}</span>
          </div>
          <div
            className={'ext-tab' + (tab === 'browse' ? ' on' : '')}
            onClick={() => setTab('browse')}
          >
            Browse
          </div>
        </div>

        {tab === 'installed' &&
          (data.loading ? (
            <div className="py-16 text-center text-sm text-[var(--t3)]">Loading…</div>
          ) : data.error ? (
            <div className="py-16 text-center text-sm text-[var(--red)]">{data.error}</div>
          ) : data.exts.length === 0 && !canAdd ? (
            <div className="py-16 text-center text-sm text-[var(--t3)]">
              No extensions in this workspace yet.
            </div>
          ) : (
            <div className="ext-grid">
              {data.exts.map((e) => (
                <ExtCard
                  key={e.id}
                  ext={e}
                  groups={data.groups}
                  canToggle={canEdit}
                  onToggle={(next) => onToggle(e.id, next)}
                  onOpenMenu={(rect) => openMenu(e.id, rect)}
                />
              ))}

              {canAdd && (
                <div className="ext-card ext-add" onClick={() => setTab('browse')}>
                  <div className="ext-add-ic">
                    <Plus size={19} />
                  </div>
                  <div className="ext-add-t">Add an extension</div>
                  <div className="ext-add-d">From the Chrome Web Store or a .crx file</div>
                </div>
              )}
            </div>
          ))}

        {tab === 'browse' && (
          <BrowseTab canAdd={canAdd} busy={add.busy} onAdd={doAddFromWebStore} />
        )}
      </div>

      {menuExt && menu && (
        <ExtCardMenu
          pos={{ x: menu.x, y: menu.y, up: menu.up }}
          actions={{
            onManage: () => setAssignFor(menuExt),
            onOptions: () => setDetailsFor(menuExt),
            onRemove: () => onRemove(menuExt),
            canEdit,
            canDelete
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {assignFor && (
        <AssignEditor
          ext={assignFor}
          groups={data.groups}
          profiles={data.profiles}
          saving={assignSaving}
          onSave={onSaveAssign}
          onClose={() => setAssignFor(null)}
        />
      )}

      {detailsFor && <ExtDetails ext={detailsFor} onClose={() => setDetailsFor(null)} />}

      <ToastView toast={toast} position="bottom-center" />
    </div>
  )
}
