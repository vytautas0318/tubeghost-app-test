// Header for the TubeProxies tab: live-read status + refresh, search (IP or tag),
// and the bulk actions ported from tubeproxies.com (Check All / Copy All /
// Export) plus a Buy-more link back to tubeproxies.com. Rendered in
// TubeGhost's dark DS — only the column/action semantics are ported, not the
// reference's light styling.

import * as React from 'react'
import { CheckCheck, Copy, Download, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui'
import type { ViewProxy } from './types'

const BUY_URL = 'https://tubeproxies.com'

// ip:port:username:password lines for the given proxies (matches the
// reference's Copy All / Export format).
function toLines(rows: ViewProxy[]): string {
  return rows
    .map((p) => `${p.host}:${p.port}:${p.username ?? ''}:${p.password_encrypted ?? ''}`)
    .join('\n')
}

export function TubeproxiesToolbar({
  rows,
  selectedRows,
  search,
  onSearch,
  onRefresh,
  onCheckAll,
  onToast
}: {
  rows: ViewProxy[]
  selectedRows: ViewProxy[]
  search: string
  onSearch: (v: string) => void
  onRefresh: () => void
  onCheckAll: () => void
  onToast: (kind: 'success' | 'error' | 'info', text: string) => void
}): React.ReactElement {
  const target = selectedRows.length > 0 ? selectedRows : rows
  const selCount = selectedRows.length

  const copyAll = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(toLines(target))
      onToast('success', `Copied ${target.length} ${target.length === 1 ? 'proxy' : 'proxies'}`)
    } catch (e) {
      onToast('error', (e as Error).message)
    }
  }

  const exportTxt = (): void => {
    const blob = new Blob([toLines(target)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'proxies.txt'
    a.click()
    URL.revokeObjectURL(url)
    onToast('success', `Exported ${target.length} ${target.length === 1 ? 'proxy' : 'proxies'}`)
  }

  return (
    <div className="tp-toolbar">
      <div className="tp-sync">
        <span>Live from TubeProxies — updates automatically</span>
      </div>

      <div className="tp-actions">
        <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={onRefresh}>
          Refresh
        </Button>
        <div className="pop-search tp-search">
          <Search />
          <input
            placeholder="Search IP or tag…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <Button variant="ghost" icon={<CheckCheck size={14} />} onClick={onCheckAll}>
          Check All
        </Button>
        <Button variant="ghost" icon={<Copy size={14} />} onClick={copyAll}>
          {selCount > 0 ? `Copy (${selCount})` : 'Copy All'}
        </Button>
        <Button variant="ghost" icon={<Download size={14} />} onClick={exportTxt}>
          Export
        </Button>
        <Button
          variant="primary"
          icon={<ExternalLink size={14} />}
          onClick={() => window.open(BUY_URL, '_blank', 'noopener')}
        >
          Buy more
        </Button>
      </div>
    </div>
  )
}
