import * as React from 'react'

// Page header: title + live "N enabled · synced across M profiles" subtitle.
// The add actions (upload .crx / Web Store) were desktop-only (local file
// import) and have been removed for the web app — extensions are managed as
// catalog rows and assigned to profiles.
export function ExtensionsHeader({
  enabledCount,
  syncedProfiles
}: {
  enabledCount: number
  syncedProfiles: number
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
    </div>
  )
}
