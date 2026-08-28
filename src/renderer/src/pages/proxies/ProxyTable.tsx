// Single, config-driven proxies table shared by both tabs. The leading
// select-all + sortable "#" and the trailing actions column are owned here;
// everything between them comes from the active tab's ColumnConfig[]. This is
// deliberately the ONLY proxies table — selection, sort, and pagination live
// once, in the page + useSelectionAndPaging, never duplicated per tab.

import * as React from 'react'
import { ProxyRowMenu } from './ProxyRowMenu'
import type { ViewProxy } from './types'
import type { CellHandlers, ColumnConfig } from './columns'

export function ProxyTable({
  rows,
  columns,
  onRowClick,
  selectAllNode,
  isSelected,
  onSelectChange,
  onTest,
  onDelete,
  onAssign,
  onEditLabel,
  onCopied,
  sortHeader,
  footer
}: {
  rows: ViewProxy[]
  columns: ColumnConfig[]
  onRowClick: (row: ViewProxy) => void
  selectAllNode: React.ReactNode
  isSelected: (id: string) => boolean
  onSelectChange: (id: string, checked: boolean) => void
  onTest: (row: ViewProxy) => void
  onDelete: (row: ViewProxy) => void
  onAssign: (row: ViewProxy) => void
  onEditLabel: (row: ViewProxy) => void
  // Optional: lets the page toast after a cell copies a value.
  onCopied?: (text: string) => void
  sortHeader: React.ReactNode
  // Rendered inside the table panel, below the rows (the bulk-action bar).
  // Must live INSIDE .tbl so it shares the panel's border/background instead
  // of floating in the gap beneath it.
  footer?: React.ReactNode
}): React.ReactElement {
  // 34px select · 36px sortable # · <config columns> · 44px actions
  const gridTemplate = ['34px', '36px', ...columns.map((c) => c.width), '44px'].join(' ')
  // Width below which the row scrolls horizontally instead of squeezing columns
  // into ellipsis. Derived from each column's measured minPx (plus the fixed
  // select/#/actions tracks, the 12px inter-column gaps and 32px row padding),
  // so adding or removing a column keeps this correct automatically.
  const trackCount = columns.length + 3
  const minWidth =
    34 + 36 + 44 + columns.reduce((n, c) => n + c.minPx, 0) + (trackCount - 1) * 12 + 32

  const handlers: CellHandlers = { onEditLabel, onCopied }

  return (
    <div
      className="tbl proxy"
      style={{ ['--px-cols' as string]: gridTemplate, ['--px-min' as string]: `${minWidth}px` }}
    >
      <div className="tbl-head">
        {selectAllNode}
        {sortHeader}
        {columns.map((c) => (
          <div className="th" key={c.key}>
            {c.header}
          </div>
        ))}
        <div className="th" />
      </div>
      {rows.map((p) => (
        <Row
          key={p.id}
          proxy={p}
          columns={columns}
          handlers={handlers}
          selected={isSelected(p.id)}
          onSelectChange={(c) => onSelectChange(p.id, c)}
          onClick={() => onRowClick(p)}
          onTest={() => onTest(p)}
          onDelete={() => onDelete(p)}
          onAssign={() => onAssign(p)}
        />
      ))}
      {footer}
    </div>
  )
}

function Row({
  proxy: p,
  columns,
  handlers,
  selected,
  onSelectChange,
  onClick,
  onTest,
  onDelete,
  onAssign
}: {
  proxy: ViewProxy
  columns: ColumnConfig[]
  handlers: CellHandlers
  selected: boolean
  onSelectChange: (checked: boolean) => void
  onClick: () => void
  onTest: () => void
  onDelete: () => void
  onAssign: () => void
}): React.ReactElement {
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

      {columns.map((c) => (
        <div key={c.key} style={{ minWidth: 0 }}>
          {c.cell(p, handlers)}
        </div>
      ))}

      <div
        style={{ display: 'flex', justifyContent: 'flex-end' }}
        onClick={(e) => e.stopPropagation()}
      >
        <ProxyRowMenu
          proxy={p}
          onView={onClick}
          onTest={onTest}
          onDelete={onDelete}
          onAssign={onAssign}
        />
      </div>
    </div>
  )
}
