// Tab bar between the stat cards and the table. State lives in the route
// (/proxies/:tab) so it survives a refresh; switching is a route change only —
// the underlying proxies query is never refetched.

import * as React from 'react'
import { SegmentedControl } from '@tubeghost/ui'
import type { ProxyTab } from './proxy-tab'

export function ProxyTabs({
  tab,
  tubeproxiesCount,
  customCount,
  onChange
}: {
  tab: ProxyTab
  tubeproxiesCount: number
  customCount: number
  onChange: (t: ProxyTab) => void
}): React.ReactElement {
  return (
    <div style={{ marginBottom: '16px' }}>
      <SegmentedControl<ProxyTab>
        value={tab}
        onChange={onChange}
        options={[
          { value: 'tubeproxies', label: `Proxies by TubeProxies (${tubeproxiesCount})` },
          { value: 'custom', label: `Custom proxies (${customCount})` }
        ]}
      />
    </div>
  )
}
