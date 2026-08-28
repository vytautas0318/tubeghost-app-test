// The two Proxies-page overlays: the row detail/edit drawer and the
// assign-to-profile modal. Split out of Proxies.tsx to keep the orchestrator
// under the file-size limit; all state stays owned by the page and is passed
// down.

import * as React from 'react'
import { updateCustomProxyConnection, updateProxyRow, type ProxyRow } from '@/lib/proxies'
import type { ProfileRow } from '@/lib/profiles'
import { ProxyDetailDrawer } from './ProxyDetailDrawer'
import { AssignProfilePopover } from './AssignProfilePopover'
import type { ViewProxy } from './types'

export function ProxiesOverlays({
  selectedRow,
  assignRow,
  workspaceId,
  view,
  perms,
  setSelectedRow,
  setAssignRow,
  onDelete,
  onTest,
  onToast,
  onRefresh,
  onPatchLocal
}: {
  selectedRow: ProxyRow | null
  assignRow: ProxyRow | null
  workspaceId: string
  view: ViewProxy[]
  perms: { canEdit: boolean; canDelete: boolean; canTest: boolean }
  setSelectedRow: (r: ProxyRow | null) => void
  setAssignRow: (r: ProxyRow | null) => void
  onDelete: (r: ProxyRow) => void
  onTest: (r: ViewProxy, set: (row: ProxyRow) => void) => void
  onToast: (kind: 'success' | 'error' | 'info', text: string) => void
  onRefresh: () => void
  onPatchLocal: (id: string, patch: Partial<ProxyRow>) => void
}): React.ReactElement {
  // The drawer takes a ProxyRow, but the profile linkage lives on the ViewProxy
  // overlay — resolve it once here rather than per prop.
  const viewRow = selectedRow ? view.find((v) => v.id === selectedRow.id) : undefined

  return (
    <>
      {selectedRow && (
        <ProxyDetailDrawer
          proxy={selectedRow}
          profileCount={viewRow?.profileCount ?? 0}
          profileNumbers={viewRow?.profileNumbers ?? []}
          canEdit={perms.canEdit}
          canDelete={perms.canDelete}
          canTest={perms.canTest}
          onClose={() => setSelectedRow(null)}
          onDelete={() => onDelete(selectedRow)}
          onTest={() => onTest(selectedRow as ViewProxy, setSelectedRow)}
          onPatch={async (patch) => {
            try {
              const updated = await updateProxyRow(selectedRow, patch)
              setSelectedRow(updated)
              // Also heal the page's list: the drawer's copy is separate from
              // `view`, so without this the Tag column and the label search
              // keep the pre-edit value until the next Refresh.
              onPatchLocal(selectedRow.id, patch)
              onToast('success', 'Proxy updated')
            } catch (e) {
              onToast('error', (e as Error).message)
            }
          }}
          onSaveConnection={async (draft) => {
            try {
              const { proxy, profilesUpdated } = await updateCustomProxyConnection(selectedRow, {
                proxy_type: draft.proxy_type,
                host: draft.host.trim(),
                port: Number(draft.port),
                username: draft.username.trim() || null,
                password_encrypted: draft.password || null
              })
              setSelectedRow(proxy)
              onPatchLocal(proxy.id, proxy)
              onToast(
                'success',
                profilesUpdated > 0
                  ? `Connection saved · ${profilesUpdated} ${profilesUpdated === 1 ? 'profile' : 'profiles'} updated`
                  : 'Connection saved'
              )
              // Host/port drive the geo + test columns; a changed endpoint
              // makes the stored geo and last-test result meaningless.
              onRefresh()
            } catch (e) {
              onToast('error', (e as Error).message)
            }
          }}
        />
      )}

      {assignRow && (
        <AssignProfilePopover
          proxy={assignRow}
          workspaceId={workspaceId}
          onClose={() => setAssignRow(null)}
          onAssigned={(profile: ProfileRow) => {
            setAssignRow(null)
            onToast('success', `Assigned to ${profile.name}`)
            onRefresh()
          }}
        />
      )}
    </>
  )
}
