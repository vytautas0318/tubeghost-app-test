// Per-tab column configuration for the single ProxyTable. Both the
// TubeProxies tab and the Custom tab drive the SAME table component from one
// of these config arrays — selection, sort, and pagination are never
// duplicated. Each column supplies its grid width (feeds gridTemplateColumns)
// and a cell renderer that receives the row plus the shared row handlers.

import * as React from 'react'
import { StatusPill, type PillState } from '@/components/ui'
import { NavIcon } from '@/components/sidebar/navIcons'
import { Globe } from 'lucide-react'
import { RevealPassword } from './RevealPassword'
import { Flag } from '@/components/Flag'
import { hasFlag } from '@/lib/flags'
import { shortCountry, type ViewProxy } from './types'
import type { ProxyStatus } from '@/lib/proxies'

// Real status → DS StatusPill (Live / Check / Idle look).
const STATUS_PILL: Record<ProxyStatus, { state: PillState; label: string }> = {
  active: { state: 'ready', label: 'Live' },
  expired: { state: 'warn', label: 'Check' },
  released: { state: 'idle', label: 'Idle' },
  error: { state: 'warn', label: 'Error' }
}

// Handlers a cell may call. Passed straight through from the page so the
// table stays presentational.
export interface CellHandlers {
  onEditLabel: (row: ViewProxy) => void
}

export interface ColumnConfig {
  key: string
  header: React.ReactNode
  // CSS grid track for this column (goes into grid-template-columns).
  width: string
  cell: (row: ViewProxy, h: CellHandlers) => React.ReactNode
  // When true the header cell renders nothing (trailing actions column).
  blankHeader?: boolean
}

function protoLabel(p: ViewProxy): string {
  return p.proxy_type === 'socks5' ? 'SOCKS' : p.proxy_type === 'wireguard' ? 'WG' : 'HTTP'
}

// ---- Shared cell renderers -------------------------------------------------
// Plain render functions (not components) — they return JSX for a given row so
// the config stays a single data module with no component exports.

function renderHost(p: ViewProxy): React.ReactNode {
  const isSocks = p.proxy_type === 'socks5'
  // Same host:port exists under both sources. Flag it non-destructively —
  // wording depends on which copy this row is.
  const dupLabel = p.source === 'tubeproxies' ? 'Also added manually' : 'Duplicate of synced'
  return (
    <div className="host">
      <div className={'proto ' + (isSocks ? 'socks' : 'http')}>{protoLabel(p)}</div>
      <div style={{ minWidth: 0 }}>
        <div className="host-addr">
          {p.host}
          <span className="port">:{p.port}</span>
        </div>
        {/* Sub-line so the badge never competes horizontally with the
            address (which would overflow into the Tag column). */}
        {p.duplicateOfOtherSource && (
          <div className="host-sub">
            <span
              className="dup-badge"
              title={`This proxy also exists on the other tab. ${dupLabel}.`}
            >
              {dupLabel}
            </span>
          </div>
        )}
        {p.label && <div className="host-lbl">{p.label}</div>}
      </div>
    </div>
  )
}

function renderCountry(p: ViewProxy): React.ReactNode {
  const full = p.country_name || p.country_code || '—'
  const name = p.country_name ? shortCountry(p.country_name) : full
  return (
    <div className="country-cell">
      {hasFlag(p.country_code) ? (
        <Flag code={p.country_code} size={18} />
      ) : (
        <Globe size={14} style={{ color: 'var(--t4)' }} />
      )}
      <div style={{ minWidth: 0 }}>
        {/* title shows the full official name; the cell shows the compact form
            and truncates as a backstop for anything not in the short-name map. */}
        <div className="ctry-name" title={full}>
          {name}
        </div>
        {p.city && (
          <div className="ctry-city" title={p.city}>
            {p.city}
          </div>
        )}
      </div>
    </div>
  )
}

function renderProfiles(p: ViewProxy): React.ReactNode {
  return p.profileCount > 0 ? (
    <span className="px-profiles">
      <NavIcon name="profiles" size={14} />
      {p.profileCount}
    </span>
  ) : (
    <span className="px-profiles zero">0</span>
  )
}

// The single editable "tag" maps to the `label` column (no tags[] column
// exists). Clicking opens the inline label editor owned by the page.
function renderTag(p: ViewProxy, h: CellHandlers): React.ReactNode {
  return (
    <div
      className="tags-edit"
      onClick={(e) => {
        e.stopPropagation()
        h.onEditLabel(p)
      }}
    >
      {p.label ? (
        <span className="host-lbl" style={{ margin: 0 }}>
          {p.label}
        </span>
      ) : (
        <span className="tags-none">Add tag</span>
      )}
    </div>
  )
}

function renderStatus(p: ViewProxy): React.ReactNode {
  const pill = STATUS_PILL[p.status]
  return <StatusPill state={pill.state} label={pill.label} />
}

// Status for a PURCHASED proxy — in practice always "Live", because the read
// function returns active rows only: an expired proxy disappears from
// TubeGhost exactly as it disappears from TubeProxies (decision 2026-08-04,
// migration 20260804b).
//
// The pill is kept for parity with the Custom tab and as an honest fallback
// if a non-active row ever reaches this table. The real value here is the
// sub-line: how long the subscription has left, which is the one thing this
// tab could not show before.
function renderPurchasedStatus(p: ViewProxy): React.ReactNode {
  const live = p.status === 'active'
  return (
    <div style={{ minWidth: 0 }}>
      <StatusPill state={live ? 'ready' : 'warn'} label={live ? 'Live' : 'Expired'} />
      {p.expiresRelative && (
        <div className="ctry-city" title={p.expires_at ?? undefined}>
          expires {p.expiresRelative}
        </div>
      )}
    </div>
  )
}

// ---- TubeProxies tab -------------------------------------------------------
// Mirrors tubeproxies.com column order (minus Score, which has no backing
// column here) and adds Profiles — the reason this page exists in-app.
// Host/port/username/password are strictly read-only (no inputs); only the
// Tag (label) and notes are editable, enforced here in the UI on top of the
// DB trigger that blocks TubeProxies credential edits.
export const TUBEPROXIES_COLUMNS: ColumnConfig[] = [
  // Wider than the other columns: the mono host:port must fit without
  // truncating, and it carries the dup badge. Neighbours are tightened to
  // compensate so the row doesn't overflow.
  { key: 'ip', header: 'IP Address', width: 'minmax(180px,2.2fr)', cell: (p) => renderHost(p) },
  { key: 'tag', header: 'Tag', width: 'minmax(0,0.9fr)', cell: (p, h) => renderTag(p, h) },
  {
    key: 'username',
    header: 'Username',
    width: 'minmax(0,0.9fr)',
    cell: (p) => <span className="px-ro">{p.username || '—'}</span>
  },
  {
    key: 'password',
    header: 'Password',
    width: 'minmax(0,0.9fr)',
    cell: (p) => <RevealPassword password={p.password_encrypted} />
  },
  { key: 'location', header: 'Location', width: 'minmax(0,0.8fr)', cell: (p) => renderCountry(p) },
  {
    key: 'type',
    header: 'Type',
    width: 'minmax(0,0.6fr)',
    cell: (p) => <span className="px-type">{protoLabel(p)}</span>
  },
  {
    key: 'status',
    header: 'Status',
    width: 'minmax(0,0.9fr)',
    cell: (p) => renderPurchasedStatus(p)
  },
  { key: 'profiles', header: 'Profiles', width: 'minmax(0,0.7fr)', cell: (p) => renderProfiles(p) }
]

// ---- Custom tab ------------------------------------------------------------
// Keeps TubeGhost's existing layout (# · IP · Country · Profiles · Tags · Status).
// The leading select + sortable "#" and the trailing actions column are owned
// by the table shell (shared with the TubeProxies tab), so they are NOT here.
export const CUSTOM_COLUMNS: ColumnConfig[] = [
  { key: 'ip', header: 'IP', width: 'minmax(0,1.6fr)', cell: (p) => renderHost(p) },
  { key: 'country', header: 'Country', width: 'minmax(0,1.3fr)', cell: (p) => renderCountry(p) },
  { key: 'profiles', header: 'Profiles', width: 'minmax(0,0.7fr)', cell: (p) => renderProfiles(p) },
  { key: 'tags', header: 'Tags', width: 'minmax(0,0.95fr)', cell: (p, h) => renderTag(p, h) },
  { key: 'status', header: 'Status', width: 'minmax(0,0.9fr)', cell: (p) => renderStatus(p) }
]
