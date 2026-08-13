// The Simple view: a search field, the page's Group/Tag filter chips, a
// match count, the card grid, and a pager. Port of the design system's
// ProfileCards container (ui_kits/browser/ProfileCards.jsx + cards.css
// `.pc-*`), plus paging the prototype has no need for — it renders 30
// sample profiles, while a Team workspace can hold 1000.
//
// Paging state is the SAME state the table uses (useSelectionAndPaging on
// the page), so switching Simple ⇄ Advanced keeps your page and rows-per-page
// instead of dumping you back at the top.
//
// Layout is three bands: a fixed filter bar, a scrolling grid, and a fixed
// footer. Only the middle scrolls, so the pager stays reachable without
// scrolling to the bottom of 200 cards.

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { ProfileCard } from './ProfileCard'
import { Pagination, type PageSize } from './Pagination'
import type { ViewProfile } from './types'
import type { ProfileRow as ProfileRowType } from '@/lib/profiles'

export function ProfileCardGrid({
  rows,
  raws,
  matched,
  total,
  query,
  onQuery,
  filters,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onChanged,
  canEdit,
  onToast,
  onOpen,
  canLaunch
}: {
  // The current PAGE of profiles, not the whole filtered set.
  rows: ViewProfile[]
  // Raw rows keyed by id — the card needs the full row for the menu,
  // the launch action and the linked channel.
  raws: Map<string, ProfileRowType>
  // How many profiles match the active filters (across all pages) — what
  // the pager counts and what the "N of M" line reports.
  matched: number
  // How many profiles exist in the workspace, unfiltered.
  total: number
  query: string
  onQuery: (v: string) => void
  // The page's Group + Tag filter controls, rendered inline next to search
  // so the Simple view filters through exactly the same state as the table.
  filters?: React.ReactNode
  page: number
  pageSize: PageSize
  onPageChange: (p: number) => void
  onPageSizeChange: (n: PageSize) => void
  onChanged: (updated?: ProfileRowType) => void
  canEdit: boolean
  onToast?: (kind: 'error' | 'info', text: string) => void
  onOpen: (p: ViewProfile, raw: ProfileRowType) => void
  canLaunch: boolean
}): React.ReactElement {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="pc-bars">
        <div className="pc-search wide">
          <Search />
          <input
            value={query}
            aria-label="Search profiles"
            placeholder="Search profiles, groups, proxies…"
            onChange={(e) => onQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="pc-clear"
              aria-label="Clear search"
              onClick={() => onQuery('')}
            >
              <X />
            </button>
          )}
        </div>
        {filters}
      </div>

      <div className="pc-wrap flex-1 min-h-0 overflow-auto">
        {matched !== total && (
          <div className="pc-count" role="status" aria-live="polite">
            <b>{matched}</b> of {total} profiles
          </div>
        )}

        <div className="pc-grid">
          {rows.map((p) => {
            const raw = raws.get(p.id)
            if (!raw) return null
            return (
              <ProfileCard
                key={p.id}
                profile={p}
                raw={raw}
                onChanged={onChanged}
                canEdit={canEdit}
                onToast={onToast}
                onOpen={() => onOpen(p, raw)}
                canLaunch={canLaunch}
              />
            )
          })}
        </div>

        {!rows.length && (
          <div className="pc-empty">
            {query ? `No profile matches “${query}”.` : 'No profile matches these filters.'}
          </div>
        )}
      </div>

      {/* Nothing matched → the empty state above already says so; a pager
          reading "No profiles" under it would just be noise. selectedCount is
          always 0: selection is a table-only affordance, and reporting a
          leftover table selection in a view with no checkboxes would be a
          claim the user can't act on or see. */}
      {matched > 0 && (
        <div className="pc-foot">
          <Pagination
            total={matched}
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            selectedCount={0}
          />
        </div>
      )}
    </div>
  )
}
