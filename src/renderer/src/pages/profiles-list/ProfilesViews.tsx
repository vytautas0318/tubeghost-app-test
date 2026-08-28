// The two Profiles presentations: Simple (card grid) and Advanced (table).
//
// Ported from the desktop renderer. Session-sync props are omitted: syncing a
// profile's browser session needs the local engine, which a web page has no
// access to. Launch is likewise replaced by the "desktop app required" prompt.
//
// Extracted from ProfilesList.tsx so that page stays a thin orchestrator
// (250-line cap). Both take the SAME already-filtered/sorted/paged rows and
// the SAME selection + change handlers from the page — neither owns state, so
// the two views cannot drift apart in what they show or what they do.

import * as React from 'react'
import { ProfileRow } from './ProfileRow'
import { ProfileCard } from './ProfileCard'
import { SelectAllCheckbox } from './SelectAllCheckbox'
import { SortHeader, type SortKey, type SortState } from './SortHeader'
import type { ViewProfile } from './types'
import type { ProfileRow as ProfileRowType } from '@/lib/profiles'
import type { ProxyRow } from '@/lib/proxies'
import type { GroupRow } from '@/lib/groups'

interface SharedProps {
  paged: ViewProfile[]
  rows: ProfileRowType[]
  proxyMetaFor: (raw: ProfileRowType) => ProxyRow | null
  // Passing the updated row lets the page patch it in place; omitting it
  // forces a full reload, for changes touching more than this row.
  onChanged: (updated?: ProfileRowType) => void
  selected: Set<string>
  // `range` = the click was shift-held; the hook extends from its anchor.
  onToggleRow: (id: string, checked: boolean, range?: boolean) => void
  workspaceId: string
  // Web has no local engine: raises the "desktop app required" modal.
  onOpen: (p: ViewProfile, raw: ProfileRowType) => void
  canLaunch: boolean
  onToast?: (kind: 'error' | 'info', text: string) => void
  // Both views edit group + name + proxy inline now, so these are shared
  // rather than Advanced-only.
  groups: GroupRow[]
  canEdit: boolean
}

export interface AdvancedViewProps extends SharedProps {
  // Lets the page drop a workspace-deleted tag from the active filter.
  onTagRenamedOrRemoved?: (from: string, to: string | null) => void
  pageIds: string[]
  pageSelectedCount: number
  onToggleSelectAll: (checked: boolean) => void
  sort: SortState
  toggleSort: (key: SortKey) => void
  allTags: string[]
  safePage: number
  pageSize: number
}

/** Simple view — one card per profile. */
export function SimpleProfilesView({
  paged,
  rows,
  proxyMetaFor,
  onChanged,
  selected,
  onToggleRow,
  workspaceId,
  onOpen,
  canLaunch,
  onToast,
  groups,
  canEdit
}: SharedProps): React.ReactElement {
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="pc-grid">
        {paged.map((p) => {
          const raw = rows.find((r) => r.id === p.id)
          if (!raw) return null
          return (
            <ProfileCard
              key={p.id}
              profile={p}
              raw={raw}
              proxyMeta={proxyMetaFor(raw)}
              onChanged={onChanged}
              selected={selected.has(p.id)}
              selectionActive={selected.size > 0}
              onSelectChange={(c, range) => onToggleRow(p.id, c, range)}
              workspaceId={workspaceId}
              onOpen={() => onOpen(p, raw)}
              canLaunch={canLaunch}
              onToast={onToast}
              groups={groups}
              canEdit={canEdit}
            />
          )
        })}
      </div>
      {paged.length === 0 && <div className="pc-empty">No profile matches these filters.</div>}
    </div>
  )
}

/** Advanced view — the existing table, unchanged. */
export function AdvancedProfilesView({
  paged,
  rows,
  proxyMetaFor,
  onChanged,
  onTagRenamedOrRemoved,
  selected,
  onToggleRow,
  workspaceId,
  onOpen,
  canLaunch,
  onToast,
  pageIds,
  pageSelectedCount,
  onToggleSelectAll,
  sort,
  toggleSort,
  allTags,
  groups,
  canEdit,
  safePage,
  pageSize
}: AdvancedViewProps): React.ReactElement {
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-[var(--panel-2)] border-b border-[var(--line)] text-[var(--t3)] text-[11.5px] font-semibold sticky top-0 z-10">
          <tr>
            <th className="text-center px-4 py-3 w-12">
              <SelectAllCheckbox
                total={pageIds.length}
                selectedCount={pageSelectedCount}
                onToggle={onToggleSelectAll}
              />
            </th>
            <th className="text-left px-3 py-3 w-14">
              <SortHeader
                label="#"
                active={sort.key === 'number'}
                dir={sort.dir}
                onClick={() => toggleSort('number')}
              />
            </th>
            {/*
              Column sizing, in percentages so the row stays evenly
              distributed at any window width. Percentages total 100 alongside
              the fixed columns; min-widths stop any of them collapsing.
            */}
            <th className="text-left px-3 py-3 w-[26%] min-w-[160px]">
              <SortHeader
                label="Profile"
                active={sort.key === 'name'}
                dir={sort.dir}
                onClick={() => toggleSort('name')}
                showInactiveIcon
              />
            </th>
            <th className="text-left px-3 py-3 w-[14%] min-w-[100px]">Group</th>
            <th className="text-left px-3 py-3 w-[24%] min-w-[190px] whitespace-nowrap">Proxy</th>
            <th className="text-left px-3 py-3 w-[16%] min-w-[110px]">Tags</th>
            <th className="text-left px-3 py-3 w-[20%] min-w-[130px] whitespace-nowrap">
              <SortHeader
                label="Last opened"
                active={sort.key === 'last_opened'}
                dir={sort.dir}
                onClick={() => toggleSort('last_opened')}
              />
            </th>
            {/* Wide enough for the Launch button PLUS the "IN USE" badge. */}
            <th className="text-right px-3 py-3 w-[210px]"></th>
            <th className="text-right px-3 py-3 w-[60px]"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line-2)]">
          {paged.map((p, idx) => {
            const raw = rows.find((r) => r.id === p.id)
            if (!raw) return null
            return (
              <ProfileRow
                key={p.id}
                profile={p}
                raw={raw}
                rowNumber={(safePage - 1) * pageSize + idx + 1}
                proxyMeta={proxyMetaFor(raw)}
                onChanged={onChanged}
                onTagRenamedOrRemoved={onTagRenamedOrRemoved}
                selected={selected.has(p.id)}
                selectionActive={selected.size > 0}
                onSelectChange={(c, range) => onToggleRow(p.id, c, range)}
                allTags={allTags}
                groups={groups}
                workspaceId={workspaceId}
                canEdit={canEdit}
                onOpen={() => onOpen(p, raw)}
                canLaunch={canLaunch}
                onToast={onToast}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
