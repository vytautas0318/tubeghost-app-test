import * as React from 'react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { type ProxyRow } from '@/lib/proxies'
import { ToastView, useToast } from '@/components/Toast'
import { ProxiesHeader } from './proxies/ProxiesHeader'
import { ProxiesPageHeader } from './proxies/ProxiesPageHeader'
import { ProxiesEmptyState } from './proxies/ProxiesEmptyState'
import { ProxyTable } from './proxies/ProxyTable'
import { ProxyMetrics } from './proxies/ProxyMetrics'
import { AddProxiesPanel } from './proxies/AddProxiesPanel'
import { ProxiesOverlays } from './proxies/ProxiesOverlays'
import { ProxyTabs } from './proxies/ProxyTabs'
import { isProxyTab, type ProxyTab } from './proxies/proxy-tab'
import { TubeproxiesToolbar } from './proxies/TubeproxiesToolbar'
import { TUBEPROXIES_COLUMNS, CUSTOM_COLUMNS } from './proxies/columns'
import { useProxiesData } from './proxies/useProxiesData'
import { useProxyTest } from './proxies/useProxyTest'
import { useProxySort } from './proxies/useProxySort'
import { CenterMessage, ErrorState, NoPermissionState } from './proxies/ProxiesStates'
import { Pagination } from './profiles-list/Pagination'
import { SelectAllCheckbox } from './profiles-list/SelectAllCheckbox'
import { useSelectionAndPaging } from './profiles-list/useSelectionAndPaging'
import { SortHeader } from './profiles-list/SortHeader'

export function Proxies(): React.ReactElement {
  const navigate = useNavigate()
  const { tab: tabParam } = useParams<{ tab: string }>()
  const tab: ProxyTab = isProxyTab(tabParam) ? tabParam : 'tubeproxies'
  const ws = useWorkspace((s) => s.current)
  const canView = useHasPermission('proxies.view')
  const canCreate = useHasPermission('proxies.create')
  const canDelete = useHasPermission('proxies.delete')
  const canEdit = useHasPermission('proxies.edit')
  const canTest = useHasPermission('proxies.test')

  const data = useProxiesData(ws?.workspace_id ?? null, canView, canCreate)
  const { view, counts, loading, error, removeRow, insertLocal, refresh } = data

  const [showAddPanel, setShowAddPanel] = useState(false)
  const [selectedRow, setSelectedRow] = useState<ProxyRow | null>(null)
  const [assignRow, setAssignRow] = useState<ProxyRow | null>(null)
  const [search, setSearch] = useState('')
  const { sortDir, toggle: toggleSort } = useProxySort()

  const { toast, show: showToast } = useToast()
  const proxyTest = useProxyTest()

  // ONE query, split in memory by source. Switching tabs never refetches.
  const bySource = useMemo(
    () => ({
      tubeproxies: view.filter((p) => p.source === 'tubeproxies'),
      custom: view.filter((p) => p.source !== 'tubeproxies')
    }),
    [view]
  )

  const tabRows = tab === 'tubeproxies' ? bySource.tubeproxies : bySource.custom

  // Sort by workspace ordinal; TubeProxies tab also filters by IP or tag(label).
  const filtered = useMemo(() => {
    const sign = sortDir === 'asc' ? 1 : -1
    const needle = search.trim().toLowerCase()
    const rows =
      tab === 'tubeproxies' && needle
        ? tabRows.filter(
            (p) =>
              p.host.toLowerCase().includes(needle) ||
              (p.label?.toLowerCase().includes(needle) ?? false)
          )
        : tabRows
    return [...rows].sort((a, b) => {
      if (a.proxy_number == null && b.proxy_number == null) return 0
      if (a.proxy_number == null) return 1
      if (b.proxy_number == null) return -1
      return (a.proxy_number - b.proxy_number) * sign
    })
  }, [tabRows, sortDir, search, tab])

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
  } = useSelectionAndPaging(filtered, [sortDir, tab, search])

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

  // Expired proxies have no credentials to test with (withheld server-side),
  // so testing them would just produce a row of failures.
  const onCheckAll = (): void => {
    filtered
      .filter((p) => p.status === 'active')
      .forEach((p) => proxyTest.run(p, () => undefined, showToast))
  }

  // Purchased proxies are read live and kept current by a realtime
  // subscription, so this is not a sync. It re-attaches (picking up anything
  // bought since the page opened) and re-reads. The pending flag exists
  // because without it a fast refresh looks like a dead button.
  const [refreshing, setRefreshing] = useState(false)
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

  if (!ws) return <CenterMessage text="Loading workspace…" />
  if (!canView) return <NoPermissionState />
  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ProxiesHeader counts={counts} />
        <CenterMessage text="Loading proxies…" />
      </div>
    )
  }
  if (error) return <ErrorState message={error} counts={counts} />

  const columns = tab === 'tubeproxies' ? TUBEPROXIES_COLUMNS : CUSTOM_COLUMNS
  const tabEmpty = tabRows.length === 0 && !showAddPanel
  const selectedRows = filtered.filter((p) => selected.has(p.id))

  return (
    <div className="flex-1 min-h-0 overflow-auto relative">
      <div className="wrap">
        <ProxiesPageHeader
          tab={tab}
          counts={counts}
          canCreate={canCreate}
          onAdd={() => setShowAddPanel(true)}
        />

        {showAddPanel && (
          <AddProxiesPanel
            workspaceId={ws.workspace_id}
            onClose={() => setShowAddPanel(false)}
            onAdded={onCreatedMany}
          />
        )}

        <ProxyMetrics view={view} />

        <ProxyTabs
          tab={tab}
          tubeproxiesCount={bySource.tubeproxies.length}
          customCount={bySource.custom.length}
          onChange={(t) => navigate(`/proxies/${t}`)}
        />

        {tab === 'tubeproxies' && !tabEmpty && (
          <TubeproxiesToolbar
            rows={filtered}
            selectedRows={selectedRows}
            search={search}
            onSearch={setSearch}
            onRefresh={() => void onRefresh()}
            refreshing={refreshing}
            onCheckAll={onCheckAll}
            onToast={showToast}
          />
        )}

        {tabEmpty ? (
          <ProxiesEmptyState
            tab={tab}
            canCreate={canCreate}
            onCreate={() => setShowAddPanel(true)}
            onSync={() => void onRefresh()}
          />
        ) : (
          <>
            <ProxyTable
              rows={paged}
              columns={columns}
              onRowClick={(p) => setSelectedRow(p)}
              selectAllNode={
                <SelectAllCheckbox
                  total={pageIds.length}
                  selectedCount={pageSelectedCount}
                  onToggle={onToggleSelectAll}
                />
              }
              isSelected={(id) => selected.has(id)}
              onSelectChange={onToggleRow}
              onTest={(p) => proxyTest.run(p, () => undefined, showToast)}
              onDelete={onDelete}
              onAssign={(p) => setAssignRow(p)}
              onEditLabel={(p) => setSelectedRow(p)}
              sortHeader={<SortHeader label="#" active dir={sortDir} onClick={toggleSort} />}
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
        )}
      </div>

      <ProxiesOverlays
        selectedRow={selectedRow}
        assignRow={assignRow}
        workspaceId={ws.workspace_id}
        view={view}
        perms={{ canEdit, canDelete, canTest }}
        setSelectedRow={setSelectedRow}
        setAssignRow={setAssignRow}
        onDelete={onDelete}
        onTest={(row, set) => proxyTest.run(row, set, showToast)}
        onToast={showToast}
        onRefresh={data.refresh}
      />

      <ToastView toast={toast} position="bottom-center" />
    </div>
  )
}
