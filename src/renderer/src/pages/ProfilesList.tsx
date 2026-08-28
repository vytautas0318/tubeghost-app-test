import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useAuth } from '@/store/auth'
import { EmptyState } from '@/pages/EmptyState'
import { ProfilesListHeader } from './profiles-list/ProfilesListHeader'
import { Filters } from './profiles-list/Filters'
import { SimpleProfilesView, AdvancedProfilesView } from './profiles-list/ProfilesViews'
import { SortFilter } from './profiles-list/SortFilter'
import { EMPTY_FILTERS, type FilterState } from './profiles-list/filterTypes'
import { type GroupFilter } from './profiles-list/GroupSidebar'
import { GroupFilterDropdown } from './profiles-list/GroupFilter'
import { TagFilterDropdown } from './profiles-list/TagFilter'
import { useProfilesListData } from './profiles-list/useProfilesListData'
import { toView, type ViewProfile } from './profiles-list/types'
import { type SortKey, type SortState } from './profiles-list/SortHeader'
import { applyFiltersAndSort } from './profiles-list/applyFilters'
import { Pagination } from './profiles-list/Pagination'
import { useSelectionAndPaging } from './profiles-list/useSelectionAndPaging'
import { BulkActionBar } from './profiles-list/BulkActionBar'
import { usePrefs, type ProfileView } from '@/store/prefs'
import { listGroups, type GroupRow } from '@/lib/groups'
import { listProxies, type ProxyRow } from '@/lib/proxies'
import { useHasPermission } from '@/lib/permissions'
import { useWorkspaceTags } from '@/lib/useWorkspaceTags'
import { ToastView, useToast } from '@/components/Toast'
import { getWorkspaceUserDetailsMap } from '@/lib/users'
import { DesktopAppModal } from '@/components/DesktopAppModal'
import { ExpiredProxyModal } from '@/components/ExpiredProxyModal'

export function ProfilesList(): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const { user } = useAuth()

  const { rows, loading, error, reload, patchRow } = useProfilesListData(
    workspace?.workspace_id ?? null
  )
  // Page-level toast surface shared by row actions.
  const { toast, show: showToast } = useToast()

  // Name of the profile the user tried to open, or null. Drives the
  // "desktop app required" modal — one instance for the whole table.
  const [openPrompt, setOpenPrompt] = useState<string | null>(null)
  // Set when the profile the user tried to open is bound to an EXPIRED
  // proxy. Expired proxies stay assigned to their profile on purpose
  // (decision 2026-08-04), so this modal is the only place the user finds
  // out the profile can't connect — and the nudge to renew.
  const [expiredPrompt, setExpiredPrompt] = useState<{
    name: string
    proxy: string | null
  } | null>(null)

  // Seed the assignee filter from ?assignedTo=<userId> so the Members page's
  // "View assigned profiles" lands here pre-filtered. Read once on mount —
  // clearing the chip afterwards must not be undone by the stale URL.
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<FilterState>(() => {
    const assignedTo = searchParams.get('assignedTo')
    return assignedTo ? { ...EMPTY_FILTERS, assignedTo } : EMPTY_FILTERS
  })
  // Simple (cards) vs Advanced (table). Persisted, so the page opens the way
  // the user left it.
  // Simple (cards) vs Advanced (table). Seeded ONCE from the stored default
  // (Settings → Appearance) via useState's lazy initializer, then owned by
  // this component for the rest of the session. Toggling deliberately does
  // NOT write back to the pref — an in-session look at the other view must
  // not redefine what the app opens on next launch.
  const storedView = usePrefs((s) => s.defaultProfileView)
  const [view, setView] = useState<ProfileView>(() => storedView)
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all')
  const [groups, setGroups] = useState<GroupRow[]>([])
  // Bumped by the toolbar Group dropdown after a create/delete so the group
  // list refetches (the old GroupSidebar owned this; now it's page-level).
  const [groupsVersion, setGroupsVersion] = useState(0)
  // Workspace proxies keyed by host:port, so each row can show its proxy's
  // country flag + location without a per-row fetch.
  const [proxyMeta, setProxyMeta] = useState<Map<string, ProxyRow>>(new Map())
  const [sort, setSort] = useState<SortState>(() => {
    try {
      const raw = localStorage.getItem('tpb.profiles.sort')
      if (raw) {
        const parsed = JSON.parse(raw) as { key?: string; dir?: string }
        const key: SortKey =
          parsed.key === 'last_opened' ? 'last_opened' : parsed.key === 'name' ? 'name' : 'number'
        const dir = parsed.dir === 'desc' ? 'desc' : 'asc'
        return { key, dir }
      }
    } catch {
      /* ignore */
    }
    return { key: 'number', dir: 'asc' }
  })

  // A page that navigated here can hand us one message to show (e.g. the
  // editor reporting that auto proxy assignment found an empty pool). Consumed
  // once — replace the history entry so a refresh doesn't re-toast it.
  const location = useLocation()
  const navigate = useNavigate()
  const handoffToast = (location.state as { toast?: string } | null)?.toast
  useEffect(() => {
    if (!handoffToast) return
    showToast('info', handoffToast)
    navigate(location.pathname, { replace: true, state: null })
  }, [handoffToast])

  // Drop ?assignedTo once it has seeded the filter above, so clearing the chip
  // sticks (a refresh would otherwise re-apply it from the URL).
  useEffect(() => {
    if (!searchParams.has('assignedTo')) return
    const next = new URLSearchParams(searchParams)
    next.delete('assignedTo')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    try {
      localStorage.setItem('tpb.profiles.sort', JSON.stringify(sort))
    } catch {
      /* ignore */
    }
  }, [sort])

  const toggleSort = (key: SortKey): void => {
    setSort((prev) => {
      // Switching column → pick a sensible default direction. Same
      // column → flip. # and name ascending feel natural (#1 / A–Z first);
      // last_opened descending (most recent first) matches every other product.
      if (prev.key !== key) return { key, dir: key === 'last_opened' ? 'desc' : 'asc' }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    })
  }

  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    listGroups(workspace.workspace_id)
      .then((g) => !cancelled && setGroups(g))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [workspace, rows, groupsVersion])

  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    listProxies(workspace.workspace_id)
      .then((ps) => {
        if (cancelled) return
        // Keyed BOTH by id and by host:port. proxy_id is the reliable link
        // (and the only one that survives a proxy being re-hosted), but rows
        // written before proxy_id was populated only have the denormalised
        // host/port — so keep both and let the row prefer the id.
        const m = new Map<string, ProxyRow>()
        for (const p of ps) {
          m.set(p.id, p)
          m.set(`${p.host}:${p.port}`, p)
        }
        setProxyMeta(m)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [workspace, rows])

  const groupName = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups) m.set(g.id, g.name)
    return m
  }, [groups])

  // Display names for the concurrent-open lock holder. Fetched once per
  // workspace; a failure just leaves the badge showing the device only.
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const ws = workspace?.workspace_id
    if (!ws) return
    let cancelled = false
    void getWorkspaceUserDetailsMap(ws)
      .then((m) => {
        if (cancelled) return
        setUserNames(new Map([...m].map(([id, u]) => [id, u.display_name || u.email])))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [workspace?.workspace_id])

  // Named `viewRows`, not `view` — `view` is the Simple/Advanced mode above.
  const viewRows: ViewProfile[] = useMemo(
    () => rows.map((r) => toView(r, user?.id ?? null, groupName, userNames)),
    [rows, user?.id, groupName, userNames]
  )

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) for (const t of r.tags ?? []) if (t.trim()) s.add(t.trim())
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const groupCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = { all: rows.length, ungrouped: 0 }
    for (const r of rows) {
      if (!r.group_id) counts.ungrouped += 1
      else counts[r.group_id] = (counts[r.group_id] ?? 0) + 1
    }
    return counts
  }, [rows])

  const filtered = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- intentional: memo recomputes when filters/rows change
    const now = Date.now()
    return applyFiltersAndSort({ view: viewRows, rows, groupName, groupFilter, filters, sort, now })
  }, [viewRows, rows, groupName, groupFilter, filters, sort])

  const {
    paged,
    pageIds,
    safePage,
    pageSize,
    setPage,
    setPageSize,
    selected,
    selectedCount,
    pageSelectedCount,
    onToggleRow,
    onToggleSelectAll,
    clearSelection
  } = useSelectionAndPaging(filtered, [filters, groupFilter, sort])

  const canEdit = useHasPermission('profiles.edit')
  const canDelete = useHasPermission('profiles.delete')
  const canLaunch = useHasPermission('profiles.launch')
  const canManageGroups = useHasPermission('groups.create')
  const canEditGroups = useHasPermission('groups.edit')
  const canTagCreate = useHasPermission('tags.create')
  const canTagEdit = useHasPermission('tags.edit')
  const canTagDelete = useHasPermission('tags.delete')

  // Workspace tag registry — the canonical tag list for the Tag filter (so a
  // freshly-created tag shows up even before it's on any profile) + inline
  // "New tag" creation.
  const {
    tags: wsTags,
    colorFor: tagColorFor,
    createTag,
    editTag,
    removeTag
  } = useWorkspaceTags(workspace?.workspace_id ?? null)

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected])

  // Distinct proxies actually in use, for the Proxy filter's multi-select list.
  // Derived from the PROFILES rather than the workspace proxy inventory: the
  // question this answers is "which profiles are on this proxy?", so a proxy
  // nothing uses would only be noise. Sorted by host:port so the order is
  // stable as counts change.
  const proxyOptions = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; count: number }>()
    for (const r of rows) {
      if (!r.proxy_host) continue
      const key = `${r.proxy_host}:${r.proxy_port ?? ''}`
      const hit = byKey.get(key)
      if (hit) hit.count += 1
      else byKey.set(key, { key, label: key, count: 1 })
    }
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])

  // Shared by the table row and the card: opening a profile from the web
  // build can't launch anything, so it answers with a modal — the expired
  // proxy one when that's the reason it would fail, else "desktop app
  // required".
  const openProfile = (name: string, proxy: ProxyRow | null | undefined): void => {
    if (proxy?.status === 'expired') {
      setExpiredPrompt({ name, proxy: `${proxy.host}:${proxy.port}` })
    } else {
      setOpenPrompt(name)
    }
  }

  const proxyFor = (raw: (typeof rows)[number]): ProxyRow | null =>
    (raw.proxy_id ? proxyMeta.get(raw.proxy_id) : undefined) ??
    (raw.proxy_host ? (proxyMeta.get(`${raw.proxy_host}:${raw.proxy_port}`) ?? null) : null)

  // Both views filter through the same Group + Tag controls, so they're
  // built once here and handed to whichever view is showing.
  const groupChip = (
    <GroupFilterDropdown
      workspaceId={workspace?.workspace_id ?? ''}
      groups={groups}
      filter={groupFilter}
      counts={groupCounts}
      canManage={canManageGroups}
      canEdit={canEditGroups}
      onChange={setGroupFilter}
      onGroupsChanged={() => setGroupsVersion((v) => v + 1)}
    />
  )
  const tagChip = (
    <TagFilterDropdown
      tags={wsTags}
      selected={filters.tags}
      colorFor={tagColorFor}
      canCreate={canTagCreate}
      canEdit={canTagEdit}
      canDelete={canTagDelete}
      onChange={(next) => setFilters({ ...filters, tags: next })}
      onCreate={createTag}
      onEdit={editTag}
      onDelete={removeTag}
    />
  )

  if (!workspace) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--t3)]">
        Loading workspace…
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ProfilesListHeader count={0} openCount={0} />
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--t3)]">
          Loading profiles…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ProfilesListHeader count={0} openCount={0} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 text-[var(--red)]" />
            <h3 className="text-sm font-bold text-[var(--t1)] mb-1">Failed to load profiles</h3>
            <p className="text-xs text-[var(--t2)]">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      <ProfilesListHeader
        count={rows.length}
        openCount={viewRows.filter((p) => p.status === 'open').length}
        onImported={reload}
        onToast={showToast}
        view={view}
        onViewChange={setView}
      />

      <div className="flex-1 min-h-0 px-8 pb-6 flex flex-col overflow-hidden">
        {/* One filter bar for BOTH views, as on the desktop app: the two views
            show the same filtered/sorted/paged rows, so the controls that
            produce them belong above the switch rather than inside one view. */}
        <Filters
          state={filters}
          onChange={setFilters}
          proxyOptions={proxyOptions}
          leading={groupChip}
          trailing={tagChip}
          sortControl={<SortFilter sort={sort} onChange={setSort} />}
        />

        <div
          className={
            view === 'simple'
              ? 'flex-1 min-w-0 min-h-0 flex flex-col'
              : 'flex-1 min-w-0 min-h-0 border border-[var(--line)] bg-[var(--panel)] rounded-[var(--r-lg)] shadow-[var(--shadow)] overflow-hidden flex flex-col'
          }
        >
          {view === 'simple' ? (
            <SimpleProfilesView
              paged={paged}
              rows={rows}
              proxyMetaFor={proxyFor}
              onChanged={(updated) => (updated ? patchRow(updated) : reload())}
              selected={selected}
              onToggleRow={onToggleRow}
              workspaceId={workspace.workspace_id}
              onOpen={(p, raw) => openProfile(p.name, proxyFor(raw))}
              canLaunch={canLaunch}
              onToast={showToast}
              groups={groups}
              canEdit={canEdit}
            />
          ) : (
            <AdvancedProfilesView
              onTagRenamedOrRemoved={(from, to) =>
                setFilters((f) =>
                  f.tags.includes(from)
                    ? {
                        ...f,
                        tags: to
                          ? f.tags.map((t) => (t === from ? to : t))
                          : f.tags.filter((t) => t !== from)
                      }
                    : f
                )
              }
              paged={paged}
              rows={rows}
              proxyMetaFor={proxyFor}
              onChanged={(updated) => (updated ? patchRow(updated) : reload())}
              selected={selected}
              onToggleRow={onToggleRow}
              workspaceId={workspace.workspace_id}
              onOpen={(p, raw) => openProfile(p.name, proxyFor(raw))}
              canLaunch={canLaunch}
              onToast={showToast}
              pageIds={pageIds}
              pageSelectedCount={pageSelectedCount}
              onToggleSelectAll={onToggleSelectAll}
              sort={sort}
              toggleSort={toggleSort}
              allTags={allTags}
              groups={groups}
              canEdit={canEdit}
              safePage={safePage}
              pageSize={pageSize}
            />
          )}
          <BulkActionBar
            selected={selected}
            selectedRows={selectedRows}
            groups={groups}
            allTags={allTags}
            canEdit={canEdit}
            canDelete={canDelete}
            workspaceId={workspace.workspace_id}
            onClear={clearSelection}
            onChanged={(r) => {
              reload()
              if (r.failed > 0) {
                window.alert(
                  `${r.ok} updated, ${r.failed} failed.\n\n` + r.errors.slice(0, 3).join('\n')
                )
              }
            }}
          />
          <Pagination
            total={filtered.length}
            page={safePage}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            selectedCount={selectedCount}
          />
        </div>
      </div>
      {/* Expired proxy takes precedence: it's the reason the profile would
          fail to connect, and renewing is the useful action. "Open anyway"
          falls through to the normal desktop-app flow. */}
      {expiredPrompt !== null && (
        <ExpiredProxyModal
          profileName={expiredPrompt.name}
          proxyLabel={expiredPrompt.proxy}
          onClose={() => setExpiredPrompt(null)}
          onContinue={() => {
            const name = expiredPrompt.name
            setExpiredPrompt(null)
            setOpenPrompt(name)
          }}
        />
      )}
      {/* Launching runs the local engine, which the web build doesn't have —
          the button stays visible and this explains the requirement. */}
      {openPrompt !== null && expiredPrompt === null && (
        <DesktopAppModal profileName={openPrompt} onClose={() => setOpenPrompt(null)} />
      )}
      <ToastView toast={toast} />
    </div>
  )
}
