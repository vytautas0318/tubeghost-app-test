// Loading / no-permission / error states for the Proxies page.
// Lifted out of Proxies.tsx so the page component stays under the
// size cap.

import * as React from 'react'
import { AlertCircle, ShieldAlert } from 'lucide-react'
import { ProxiesHeader } from './ProxiesHeader'

export function CenterMessage({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-[var(--t3)]">
      {text}
    </div>
  )
}

export function NoPermissionState(): React.ReactElement {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <ProxiesHeader counts={{ total: 0, active: 0, expired: 0 }} lastSync={null} />
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <ShieldAlert className="w-8 h-8 mx-auto mb-3 text-[var(--t4)]" />
          <h3 className="text-sm font-bold text-[var(--t1)] mb-1">
            You don&apos;t have access to proxies
          </h3>
          <p className="text-xs text-[var(--t3)]">
            Ask a workspace admin to grant you the <span className="mono">proxies.view</span> permission.
          </p>
        </div>
      </div>
    </div>
  )
}

export function ErrorState({
  message,
  counts,
  lastSync
}: {
  message: string
  counts: { total: number; active: number; expired: number }
  lastSync: string | null
}): React.ReactElement {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <ProxiesHeader counts={counts} lastSync={lastSync} />
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-3 text-[var(--red)]" />
          <h3 className="text-sm font-bold text-[var(--t1)] mb-1">
            Failed to load proxies
          </h3>
          <p className="text-xs text-[var(--t3)]">{message}</p>
        </div>
      </div>
    </div>
  )
}
