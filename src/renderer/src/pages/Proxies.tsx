import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

  const data = useProxiesData(ws?.workspace_id ?? null, canView)
  const { view, counts, lastSync, loading, error, removeRow, insertLocal, syncNow } = data

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

  const onCheckAll = (): void => {
    filtered.forEach((p) => proxyTest.run(p, () => undefined, showToast))
  }

  // Pull the user's purchased proxies from TubeProxies, then report a real,
  // specific outcome. A silent empty tab (email not matched to a workspace,
  // no TubeProxies account, upsert rejected) becomes a visible message.
  // `quiet` suppresses the "synced / up to date" success toast so the
  // automatic on-open sync stays invisible unless something is actually
  // wrong. Problems are always reported, automatic or not.
  const onSyncNow = async (quiet = false): Promise<void> => {
    try {
      const { pull, issues } = await syncNow()
      if (issues.length > 0) {
        const first = issues[0]
        showToast(
          'error',
          `${issues.length} TubeProxies ${issues.length === 1 ? 'proxy' : 'proxies'} not synced` +
            (first.last_error ? ` — ${first.last_error}` : '')
        )
      } else if (pull && !pull.email_matched) {
        showToast('error', 'No TubeProxies account matches your email — nothing to sync.')
      } else if (pull && pull.skipped.length > 0) {
        showToast('error', `${pull.skipped.length} could not sync — ${pull.skipped[0].reason}`)
      } else if (pull) {
        // A real import is worth announcing even on the automatic sync.
        if (pull.upserted > 0) {
          showToast(
            'success',
            `Synced ${pull.upserted} ${pull.upserted === 1 ? 'proxy' : 'proxies'} from TubeProxies`
          )
        } else if (!quiet) {
          showToast('success', 'Up to date — no new proxies')
        }
      } else if (!quiet) {
        showToast('info', 'Proxies refreshed')
      }
    } catch (e) {
      showToast('error', (e as Error).message)
    }
  }

  // Sync automatically when the Proxies page is opened from the sidebar.
  // The ref keeps it to one run per mount — switching tabs (which only
  // changes the route param) must not re-trigger a pull.
  const autoSynced = useRef(false)
  useEffect(() => {
    if (autoSynced.current) return
    if (!ws || !canView) return
    autoSynced.current = true
    void onSyncNow(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.workspace_id, canView])

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
          onBuy={() => navigate('/buy-proxies')}
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
            syncedRelative={lastSync}
            onCheckAll={onCheckAll}
            onToast={showToast}
          />
        )}

        {tabEmpty ? (
          <ProxiesEmptyState
            tab={tab}
            canCreate={canCreate}
            onCreate={() => setShowAddPanel(true)}
            onSync={() => void onSyncNow()}
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
