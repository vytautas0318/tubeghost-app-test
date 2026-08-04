// The two Proxies-page overlays: the row detail/edit drawer and the
// assign-to-profile modal. Split out of Proxies.tsx to keep the orchestrator
// under the file-size limit; all state stays owned by the page and is passed
// down.

import * as React from 'react'
import { updateProxyRow, type ProxyRow } from '@/lib/proxies'
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
  onRefresh
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
}): React.ReactElement {
  return (
    <>
      {selectedRow && (
        <ProxyDetailDrawer
          proxy={selectedRow}
          profileCount={view.find((v) => v.id === selectedRow.id)?.profileCount ?? 0}
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
              onToast('success', 'Proxy updated')
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
