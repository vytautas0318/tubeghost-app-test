import * as React from 'react'
import { Globe, Plus } from 'lucide-react'

export function ProxiesEmptyState({
  canCreate,
  onCreate
}: {
  canCreate: boolean
  onCreate: () => void
}): React.ReactElement {
  return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[var(--red-soft)] flex items-center justify-center">
          <Globe className="w-8 h-8 text-[var(--red)]" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-bold text-[var(--t1)] mb-1.5">
          No proxies yet
        </h2>
        <p className="text-sm text-[var(--t2)] mb-5">
          Add custom proxies from any provider, or sync your TubeProxies inventory once the
          integration ships in Phase 3.
        </p>
        {canCreate && (
          <button
            onClick={onCreate}
            className="px-4 py-2 text-sm font-medium bg-[var(--red)] text-white rounded-lg hover:bg-[var(--red-hover)] flex items-center gap-2 mx-auto"
          >
            <Plus className="w-4 h-4" />
            Add custom proxy
          </button>
        )}
      </div>
    </div>
  )
}
