import * as React from 'react'
import { StatusPill, type PillState } from '@/components/ui'
import { NavIcon } from '@/components/sidebar/navIcons'
import { ProxyRowMenu } from './ProxyRowMenu'
import { flagFor, type ViewProxy } from './types'
import type { ProxyStatus } from '@/lib/proxies'

// Real status → DS StatusPill (Live / Check / Idle look).
const STATUS_PILL: Record<ProxyStatus, { state: PillState; label: string }> = {
  active: { state: 'ready', label: 'Live' },
  expired: { state: 'warn', label: 'Check' },
  released: { state: 'idle', label: 'Idle' },
  error: { state: 'warn', label: 'Error' }
}

export function ProxyTable({
  rows,
  onRowClick,
  selectAllNode,
  isSelected,
  onSelectChange,
  onTest,
  onDelete,
  sortHeader
}: {
  rows: ViewProxy[]
  onRowClick: (row: ViewProxy) => void
  selectAllNode: React.ReactNode
  isSelected: (id: string) => boolean
  onSelectChange: (id: string, checked: boolean) => void
  onTest: (row: ViewProxy) => void
  onDelete: (row: ViewProxy) => void
  sortHeader: React.ReactNode
}): React.ReactElement {
  return (
    <div className="tbl proxy">
      <div className="tbl-head">
        {selectAllNode}
        {sortHeader}
        <div className="th">IP</div>
        <div className="th">Country</div>
        <div className="th">Profiles</div>
        <div className="th">Tags</div>
        <div className="th">Status</div>
        <div className="th" />
      </div>
      {rows.map((p) => (
        <Row
          key={p.id}
          proxy={p}
          selected={isSelected(p.id)}
          onSelectChange={(c) => onSelectChange(p.id, c)}
          onClick={() => onRowClick(p)}
          onTest={() => onTest(p)}
          onDelete={() => onDelete(p)}
        />
      ))}
    </div>
  )
}

function Row({
  proxy: p,
  selected,
  onSelectChange,
  onClick,
  onTest,
  onDelete
}: {
  proxy: ViewProxy
  selected: boolean
  onSelectChange: (checked: boolean) => void
  onClick: () => void
  onTest: () => void
  onDelete: () => void
}): React.ReactElement {
  const isSocks = p.proxy_type === 'socks5'
  const protoLabel = isSocks ? 'SOCKS' : p.proxy_type === 'wireguard' ? 'WG' : 'HTTP'
  const pill = STATUS_PILL[p.status]

  return (
    <div className="tr" onClick={onClick} style={{ cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSelectChange(e.target.checked)}
        className="accent-[var(--red)] cursor-pointer"
      />
      <div className="px-num">{p.proxy_number ?? '—'}</div>

      <div className="host">
        <div className={'proto ' + (isSocks ? 'socks' : 'http')}>{protoLabel}</div>
        <div style={{ minWidth: 0 }}>
          <div className="host-addr">
            {p.host}
            <span className="port">:{p.port}</span>
          </div>
          {p.label && <div className="host-lbl">{p.label}</div>}
        </div>
      </div>

      <div className="country-cell">
        <span style={{ fontSize: '16px', lineHeight: 1 }}>{flagFor(p.country_code) || '🌐'}</span>
        <div style={{ minWidth: 0 }}>
          <div className="ctry-name">{p.country_name || p.country_code || '—'}</div>
        </div>
      </div>

      <div>
        {p.profileCount > 0 ? (
          <span className="px-profiles">
            <NavIcon name="profiles" size={14} />
            {p.profileCount}
          </span>
        ) : (
          <span className="px-profiles zero">0</span>
        )}
      </div>

      <div className="tags-cell">
        <span className="tags-none">—</span>
      </div>

      <div>
        <StatusPill state={pill.state} label={pill.label} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
        <ProxyRowMenu proxy={p} onView={onClick} onTest={onTest} onDelete={onDelete} />
      </div>
    </div>
  )
}
