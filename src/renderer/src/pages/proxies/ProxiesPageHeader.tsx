// Page title + subtitle + primary actions for the Proxies page. "Add custom
// proxy" only shows on the Custom tab (TubeProxies rows come from sync, not
// manual entry); "Buy proxies" is always available.

import * as React from 'react'
import { Briefcase, Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import type { ProxyTab } from './proxy-tab'

export function ProxiesPageHeader({
  tab,
  counts,
  canCreate,
  onAdd,
  onBuy
}: {
  tab: ProxyTab
  counts: { total: number; active: number; expired: number }
  canCreate: boolean
  onAdd: () => void
  onBuy: () => void
}): React.ReactElement {
  return (
    <div className="phead">
      <div>
        <h1>Proxies</h1>
        <p>
          {counts.total} {counts.total === 1 ? 'proxy' : 'proxies'} · {counts.active} active
          {counts.expired > 0 && <> · {counts.expired} expiring</>}
        </p>
      </div>
      <div className="phead-actions">
        {tab === 'custom' && canCreate && (
          <Button icon={<Plus size={15} />} onClick={onAdd}>
            Add custom proxy
          </Button>
        )}
        <Button variant="primary" icon={<Briefcase size={15} />} onClick={onBuy}>
          Buy proxies
        </Button>
      </div>
    </div>
  )
}
