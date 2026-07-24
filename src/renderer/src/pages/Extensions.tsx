import * as React from 'react'
import { useEffect, useState } from 'react'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { ToastView, useToast } from '@/components/Toast'
import type { ExtensionWithAssignment } from '@/lib/extensions'
import { useExtensionsData } from './extensions/useExtensionsData'
import { ExtensionsHeader } from './extensions/ExtensionsHeader'
import { ExtCard } from './extensions/ExtCard'
import { ExtCardMenu } from './extensions/ExtCardMenu'
import { AssignEditor } from './extensions/AssignEditor'
import { ExtDetails } from './extensions/ExtDetails'

type MenuState = { id: string; x: number; y: number; up: boolean }

export function Extensions(): React.ReactElement {
  const ws = useWorkspace((s) => s.current)
  const workspaceId = ws?.workspace_id ?? null

  // Permission ladder (see permMap.ts): read → profiles.view; write →
  // extensions.edit; full → extensions.delete.
  const canView = useHasPermission('profiles.view')
  const canEdit = useHasPermission('extensions.edit')
  const canDelete = useHasPermission('extensions.delete')

  const data = useExtensionsData(workspaceId, canView)
  const { toast, show } = useToast()

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [assignFor, setAssignFor] = useState<ExtensionWithAssignment | null>(null)
  const [detailsFor, setDetailsFor] = useState<ExtensionWithAssignment | null>(null)
  const [assignSaving, setAssignSaving] = useState(false)

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

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <ExtensionsHeader enabledCount={enabledCount} syncedProfiles={data.syncedProfiles} />

        {data.loading ? (
          <div className="py-16 text-center text-sm text-[var(--t3)]">Loading…</div>
        ) : data.error ? (
          <div className="py-16 text-center text-sm text-[var(--red)]">{data.error}</div>
        ) : data.exts.length === 0 ? (
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
          </div>
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
