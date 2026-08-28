// Automations list header: title + live subtitle, Import / New actions, and the
// two live stat cards (Active flows / Total runs · 30 days).

import * as React from 'react'
import { Download, Plus, Zap, Clock } from 'lucide-react'
import { Button, MetricCard } from '@tubeghost/ui'

export function AutomationsHeader({
  activeCount,
  totalRuns30d,
  canWrite,
  onImport,
  onNew
}: {
  activeCount: number
  totalRuns30d: number
  canWrite: boolean
  onImport: () => void
  onNew: () => void
}): React.ReactElement {
  return (
    <>
      <div className="phead">
        <div>
          <h1>Automations</h1>
          <p>{activeCount} active flows · run no-code actions inside your profiles</p>
        </div>
        <div className="phead-actions">
          <Button icon={<Download size={15} />} onClick={onImport} disabled={!canWrite}>
            Import
          </Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={onNew} disabled={!canWrite}>
            New automation
          </Button>
        </div>
      </div>

      <div className="cards" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <MetricCard
          icon={<Zap size={16} />}
          tone="green"
          value={activeCount}
          label="Active flows"
        />
        <MetricCard
          icon={<Clock size={16} />}
          tone="blue"
          value={totalRuns30d.toLocaleString()}
          label="Total runs · 30 days"
        />
      </div>
    </>
  )
}
