import * as React from 'react'
import { MetricCard } from '@tubeghost/ui'
import { NavIcon } from '@/components/sidebar/navIcons'
import type { ViewProxy } from './types'

const BOX_IC = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M3 9h18" />
  </svg>
)
const SHIELD_IC = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
const CLOCK_IC = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

// KPI row derived from the real proxy pool.
//  - Active proxies      = proxies showing "Live" status (status === 'active')
//  - Assigned to profiles = total profiles assigned across the pool (Σ profileCount)
//  - Tested & reachable   = total proxies in the pool
//  - Expiring soon        = proxies showing "Check" status (status === 'expired')
export function ProxyMetrics({ view }: { view: ViewProxy[] }): React.ReactElement {
  const live = view.filter((p) => p.status === 'active').length
  const assignedProfiles = view.reduce((n, p) => n + p.profileCount, 0)
  const total = view.length
  const checking = view.filter((p) => p.status === 'expired').length

  return (
    <div className="cards">
      <MetricCard
        icon={<NavIcon name="proxies" size={17} />}
        tone="green"
        value={live}
        label="Active proxies"
      />
      <MetricCard icon={BOX_IC} tone="red" value={assignedProfiles} label="Assigned to profiles" />
      <MetricCard icon={SHIELD_IC} tone="blue" value={total} label="Tested & reachable" />
      <MetricCard icon={CLOCK_IC} tone="amber" value={checking} label="Expiring soon" />
    </div>
  )
}
