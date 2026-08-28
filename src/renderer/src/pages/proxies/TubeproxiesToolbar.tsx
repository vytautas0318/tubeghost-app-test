// Header for the TubeProxies tab: live-read status + refresh, search (IP or tag),
// and the bulk actions ported from tubeproxies.com (Check All / Copy All /
// Export) plus "Buy more". Rendered in TubeGhost's dark DS — only the
// column/action semantics are ported, not the reference's light styling.
//
// "Buy more" navigates IN-APP to /buy-proxies. It used to open tubeproxies.com
// in a new tab, which dropped the user on the marketing homepage and made them
// find their way to pricing → dashboard → billing. The in-app page shows the
// tiers directly and links straight to checkout.

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, CheckCheck, Copy, Download, RefreshCw, Search } from 'lucide-react'
import { Button } from '@tubeghost/ui'
import type { ViewProxy } from './types'

// ip:port:username:password lines for the given proxies (matches the
// reference's Copy All / Export format).
//
// EXPIRED proxies are skipped: the server withholds their credentials, so
// they would emit "ip:port::" — a broken line the user would paste straight
// into their tooling. Filtering here keeps the output usable.
function usable(rows: ViewProxy[]): ViewProxy[] {
  return rows.filter((p) => p.status === 'active')
}

function toLines(rows: ViewProxy[]): string {
  return usable(rows)
    .map((p) => `${p.host}:${p.port}:${p.username ?? ''}:${p.password_encrypted ?? ''}`)
    .join('\n')
}

export function TubeproxiesToolbar({
  rows,
  selectedRows,
  search,
  onSearch,
  onRefresh,
  refreshing = false,
  onCheckAll,
  onToast
}: {
  rows: ViewProxy[]
  selectedRows: ViewProxy[]
  search: string
  onSearch: (v: string) => void
  onRefresh: () => void
  refreshing?: boolean
  onCheckAll: () => void
  onToast: (kind: 'success' | 'error' | 'info', text: string) => void
}): React.ReactElement {
  const navigate = useNavigate()
  const target = selectedRows.length > 0 ? selectedRows : rows
  const selCount = selectedRows.length

  // Counts must describe what actually came out, not how many rows were on
  // screen — expired proxies are dropped by toLines().
  const out = usable(target)
  const skipped = target.length - out.length
  const skippedNote = skipped > 0 ? ` · ${skipped} expired skipped` : ''

  const copyAll = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(toLines(target))
      onToast('success', `Copied ${out.length} ${out.length === 1 ? 'proxy' : 'proxies'}${skippedNote}`)
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
    onToast('success', `Exported ${out.length} ${out.length === 1 ? 'proxy' : 'proxies'}${skippedNote}`)
  }

  return (
    <div className="tp-toolbar">
      <div className="tp-sync">
        <span>Live from TubeProxies — updates automatically</span>
      </div>

      <div className="tp-actions">
        <Button
          variant="ghost"
          icon={<RefreshCw size={14} className={refreshing ? 'spin' : undefined} />}
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
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
          icon={<Briefcase size={14} />}
          onClick={() => navigate('/buy-proxies')}
        >
          Buy more
        </Button>
      </div>
    </div>
  )
}
