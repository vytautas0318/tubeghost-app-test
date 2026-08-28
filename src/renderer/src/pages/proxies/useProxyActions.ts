// Delete + refresh handlers for the Proxies page, lifted out of the
// orchestrator to keep it under the 250-line rule.
//
// Two delete flavours on purpose: the row menu / drawer confirm per proxy and
// toast their own result, while the bulk bar confirms ONCE for the batch and
// summarises — so it needs a raw variant that neither prompts nor toasts.

import { useState } from 'react'
import type { ProxyRow } from '@/lib/proxies'

type Toast = (kind: 'success' | 'error' | 'info', text: string) => void

export interface ProxyActions {
  onDelete: (row: ProxyRow) => Promise<void>
  onDeleteRaw: (row: ProxyRow) => Promise<void>
  onRefresh: () => Promise<void>
  refreshing: boolean
}

export function useProxyActions({
  removeRow,
  refresh,
  showToast,
  onDeleted
}: {
  removeRow: (id: string) => Promise<void>
  refresh: () => Promise<unknown>
  showToast: Toast
  onDeleted: () => void
}): ProxyActions {
  const [refreshing, setRefreshing] = useState(false)

  const onDelete = async (row: ProxyRow): Promise<void> => {
    if (!confirm(`Delete proxy "${row.label || `${row.host}:${row.port}`}"?`)) return
    try {
      await removeRow(row.id)
      onDeleted()
      showToast('success', 'Proxy deleted')
    } catch (e) {
      showToast('error', (e as Error).message)
    }
  }

  const onDeleteRaw = async (row: ProxyRow): Promise<void> => {
    await removeRow(row.id)
  }

  // Purchased proxies are read live and kept current by a realtime
  // subscription, so this is not a sync. It re-attaches (picking up anything
  // bought since the page opened) and re-reads. The pending flag exists
  // because without it a fast refresh looks like a dead button.
  const onRefresh = async (): Promise<void> => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refresh()
      showToast('info', 'Proxies refreshed')
    } catch (e) {
      showToast('error', (e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  return { onDelete, onDeleteRaw, onRefresh, refreshing }
}
