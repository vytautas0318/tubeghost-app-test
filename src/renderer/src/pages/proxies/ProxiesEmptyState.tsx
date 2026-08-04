import * as React from 'react'
import { ExternalLink, Globe, Plus, RefreshCw } from 'lucide-react'

const BUY_URL = 'https://tubeproxies.com'

// Per-tab empty state. The TubeProxies tab points at buying (purchases show
// up here on their own); the Custom tab points at adding your own proxy.
export function ProxiesEmptyState({
  tab,
  canCreate,
  onCreate,
  onSync
}: {
  tab: 'tubeproxies' | 'custom'
  canCreate: boolean
  onCreate: () => void
  onSync?: () => void
}): React.ReactElement {
  const isTube = tab === 'tubeproxies'
  return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[var(--red-soft)] flex items-center justify-center">
          <Globe className="w-8 h-8 text-[var(--red)]" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-bold text-[var(--t1)] mb-1.5">
          {isTube ? 'No proxies yet' : 'Add your own proxy'}
        </h2>
        <p className="text-sm text-[var(--t2)] mb-5">
          {isTube
            ? 'Buy proxies at tubeproxies.com — they appear here automatically. Or switch to the Custom tab to add your own.'
            : 'Add a proxy from any provider — host, port, and credentials.'}
        </p>
        <div className="flex items-center gap-2 justify-center">
          {isTube ? (
            <>
              <button
                onClick={() => window.open(BUY_URL, '_blank', 'noopener')}
                className="px-4 py-2 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Buy proxies
              </button>
              {onSync && (
                <button
                  onClick={onSync}
                  className="px-4 py-2 text-sm font-medium bg-[var(--panel-2)] border border-[var(--line)] text-[var(--t1)] rounded-lg hover:bg-[var(--hover)] flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              )}
            </>
          ) : (
            canCreate && (
              <button
                onClick={onCreate}
                className="px-4 py-2 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add custom proxy
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
