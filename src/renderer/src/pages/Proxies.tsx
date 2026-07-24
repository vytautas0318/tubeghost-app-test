import * as React from 'react'
import { useMemo, useState } from 'react'
import { Plus, Briefcase } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { updateProxy, type ProxyRow } from '@/lib/proxies'
import { Button } from '@/components/ui'
import { ToastView, useToast } from '@/components/Toast'
import { ProxiesHeader } from './proxies/ProxiesHeader'
import { ProxiesEmptyState } from './proxies/ProxiesEmptyState'
import { ProxyTable } from './proxies/ProxyTable'
import { ProxyMetrics } from './proxies/ProxyMetrics'
import { ProxyDetailDrawer } from './proxies/ProxyDetailDrawer'
import { AddProxiesPanel } from './proxies/AddProxiesPanel'
import { useProxiesData } from './proxies/useProxiesData'
import { useProxyTest } from './proxies/useProxyTest'
import { CenterMessage, ErrorState, NoPermissionState } from './proxies/ProxiesStates'
import type { ViewProxy } from './proxies/types'
import { Pagination } from './profiles-list/Pagination'
import { SelectAllCheckbox } from './profiles-list/SelectAllCheckbox'
import { useSelectionAndPaging } from './profiles-list/useSelectionAndPaging'
import { SortHeader } from './profiles-list/SortHeader'

export function Proxies(): React.ReactElement {
  const navigate = useNavigate()
  const ws = useWorkspace((s) => s.current)
  const canView = useHasPermission('proxies.view')
  const canCreate = useHasPermission('proxies.create')
  const canDelete = useHasPermission('proxies.delete')
  const canEdit = useHasPermission('proxies.edit')
  const canTest = useHasPermission('proxies.test')

  const data = useProxiesData(ws?.workspace_id ?? null, canView)
  const { view, counts, lastSync, loading, error, removeRow, insertLocal } = data

  const [showAddPanel, setShowAddPanel] = useState(false)
  const [selectedRow, setSelectedRow] = useState<ProxyRow | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    try {
      return localStorage.getItem('tpb.proxies.sortDir') === 'desc' ? 'desc' : 'asc'
    } catch { return 'asc' }
  })
  React.useEffect(() => {
    try { localStorage.setItem('tpb.proxies.sortDir', sortDir) } catch { /* ignore */ }
  }, [sortDir])

  const { toast, show: showToast } = useToast()
  const proxyTest = useProxyTest()

  // Sorted by workspace ordinal; filtering lives in the drawer/search-free DS layout.
  const filtered = useMemo(() => {
    const sign = sortDir === 'asc' ? 1 : -1
    return [...view].sort((a, b) => {
      if (a.proxy_number == null && b.proxy_number == null) return 0
      if (a.proxy_number == null) return 1
      if (b.proxy_number == null) return -1
      return (a.proxy_number - b.proxy_number) * sign
    })
  }, [view, sortDir])

  const {
    paged,
    pageIds,
    safePage,
    pageSize,
    setPage,
    setPageSize,
    selectedCount,
    pageSelectedCount,
    onToggleRow,
    onToggleSelectAll,
    selected
  } = useSelectionAndPaging(filtered, [sortDir])

  const onCreatedMany = (rows: ProxyRow[]): void => {
    setShowAddPanel(false)
    rows.forEach((r) => insertLocal(r))
    showToast('success', `${rows.length} ${rows.length === 1 ? 'proxy' : 'proxies'} added`)
  }

  const onDelete = async (row: ProxyRow): Promise<void> => {
    if (!confirm(`Delete proxy "${row.label || `${row.host}:${row.port}`}"?`)) return
    try {
      await removeRow(row.id)
      setSelectedRow(null)
      showToast('success', 'Proxy deleted')
    } catch (e) {
      showToast('error', (e as Error).message)
    }
  }

  if (!ws) return <CenterMessage text="Loading workspace…" />
  if (!canView) return <NoPermissionState />
  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ProxiesHeader counts={counts} lastSync={lastSync} />
        <CenterMessage text="Loading proxies…" />
      </div>
    )
  }
  if (error) return <ErrorState message={error} counts={counts} lastSync={lastSync} />

  const isEmpty = data.rows.length === 0 && !showAddPanel

  return (
    <div className="flex-1 min-h-0 overflow-auto relative">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Proxies</h1>
            <p>
              {counts.total} {counts.total === 1 ? 'proxy' : 'proxies'} · {counts.active} active
              {counts.expired > 0 && <> · {counts.expired} expiring</>}
            </p>
          </div>
          <div className="phead-actions">
            {canCreate && !isEmpty && (
              <Button icon={<Plus size={15} />} onClick={() => setShowAddPanel(true)}>
                Add custom proxy
              </Button>
            )}
            <Button variant="primary" icon={<Briefcase size={15} />} onClick={() => navigate('/buy-proxies')}>
              Buy proxies
            </Button>
          </div>
        </div>

        {showAddPanel && (
          <AddProxiesPanel workspaceId={ws.workspace_id} onClose={() => setShowAddPanel(false)} onAdded={onCreatedMany} />
        )}

        {isEmpty ? (
          <ProxiesEmptyState canCreate={canCreate} onCreate={() => setShowAddPanel(true)} />
        ) : data.rows.length > 0 ? (
          <>
            <ProxyMetrics view={view} />
            <ProxyTable
              rows={paged}
              onRowClick={(p) => setSelectedRow(p)}
              selectAllNode={
                <SelectAllCheckbox total={pageIds.length} selectedCount={pageSelectedCount} onToggle={onToggleSelectAll} />
              }
              isSelected={(id) => selected.has(id)}
              onSelectChange={onToggleRow}
              onTest={(p) => proxyTest.run(p, () => undefined, showToast)}
              onDelete={onDelete}
              sortHeader={
                <SortHeader label="#" active dir={sortDir} onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} />
              }
            />
            <div style={{ marginTop: '14px' }}>
              <Pagination
                total={filtered.length}
                page={safePage}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                selectedCount={selectedCount}
              />
            </div>
          </>
        ) : null}
      </div>

      {selectedRow && (
        <ProxyDetailDrawer
          proxy={selectedRow}
          profileCount={view.find((v) => v.id === selectedRow.id)?.profileCount ?? 0}
          canEdit={canEdit}
          canDelete={canDelete}
          canTest={canTest}
          onClose={() => setSelectedRow(null)}
          onDelete={() => onDelete(selectedRow)}
          onTest={() => proxyTest.run(selectedRow as ViewProxy, setSelectedRow, showToast)}
          onPatch={async (patch) => {
            try {
              const updated = await updateProxy(selectedRow.id, patch)
              setSelectedRow(updated)
              showToast('success', 'Proxy updated')
            } catch (e) {
              showToast('error', (e as Error).message)
            }
          }}
        />
      )}

      <ToastView toast={toast} position="bottom-center" />
    </div>
  )
}
