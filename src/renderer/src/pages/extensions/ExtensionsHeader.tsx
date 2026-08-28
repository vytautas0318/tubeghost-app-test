import * as React from 'react'
import { Download, Plus } from 'lucide-react'
import { Button } from '@tubeghost/ui'

// Page header: title, live "N enabled · synced across M profiles" subtitle,
// and the two add actions (gated by canAdd — permission + the 'extensions'
// plan feature). The Upload .crx button drives a hidden <input type=file>
// owned by the page.
export function ExtensionsHeader({
  enabledCount,
  syncedProfiles,
  canAdd,
  busy,
  onUploadClick,
  onWebStoreClick
}: {
  enabledCount: number
  syncedProfiles: number
  canAdd: boolean
  busy: boolean
  onUploadClick: () => void
  onWebStoreClick: () => void
}): React.ReactElement {
  return (
    <div className="phead">
      <div>
        <h1>Extensions</h1>
        <p>
          {enabledCount} enabled · synced across {syncedProfiles} profile
          {syncedProfiles === 1 ? '' : 's'}
        </p>
      </div>
      {canAdd && (
        <div className="phead-actions">
          <Button icon={<Download size={15} />} disabled={busy} onClick={onUploadClick}>
            Upload .crx
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={15} />}
            disabled={busy}
            onClick={onWebStoreClick}
          >
            Add from Web Store
          </Button>
        </div>
      )}
    </div>
  )
}
