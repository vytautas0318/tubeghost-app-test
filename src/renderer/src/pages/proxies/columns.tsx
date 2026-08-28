// Per-tab column configuration for the single ProxyTable. Both the
// TubeProxies tab and the Custom tab drive the SAME table component from one
// of these config arrays — selection, sort, and pagination are never
// duplicated. Each column supplies its grid width (feeds gridTemplateColumns)
// and a cell renderer that receives the row plus the shared row handlers.

import * as React from 'react'
import { StatusPill, type PillState } from '@tubeghost/ui'
import { NavIcon } from '@/components/sidebar/navIcons'
import { Globe } from 'lucide-react'
import { RevealPassword } from './RevealPassword'
import { CopyButton } from '@/components/CopyButton'
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
  // Raised after a successful clipboard write so the page can toast. Optional
  // so existing callers keep compiling; the button still works without it.
  onCopied?: (text: string) => void
}

export interface ColumnConfig {
  key: string
  header: React.ReactNode
  // CSS grid track for this column (goes into grid-template-columns).
  width: string
  // Px this column needs to show its content WITHOUT ellipsising. Summed by
  // ProxyTable into the grid's min-width, so once the window is narrower than
  // the table the row scrolls horizontally instead of compressing columns into
  // "United States of…" / "expires in 29 …".
  minPx: number
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

function renderHost(p: ViewProxy, h?: CellHandlers): React.ReactNode {
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
          {/* Copies the full host:port — that is the form users paste into
              other tools, and it is what the drawer's Host field copies too. */}
          <CopyButton
            value={`${p.host}:${p.port}`}
            title="Copy IP and port"
            onCopied={h?.onCopied}
          />
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

// Shows WHICH profiles use this proxy ("#1, #12, #35"), not just how many.
// Past MAX_SHOWN the tail collapses to "+N" so the column keeps its width;
// the title carries the full list either way.
const MAX_SHOWN = 3

function renderProfiles(p: ViewProxy): React.ReactNode {
  if (p.profileCount === 0) return <span className="px-profiles zero">0</span>

  const all = p.profileNumbers.map((n) => `#${n}`)
  const shown = all.slice(0, MAX_SHOWN)
  const overflow = all.length - shown.length

  return (
    <span className="px-profiles" title={all.join(', ')}>
      <NavIcon name="profiles" size={14} />
      <span className="px-profiles-nums">{shown.join(', ')}</span>
      {overflow > 0 && <span className="px-profiles-more">+{overflow}</span>}
    </span>
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

// Status for a PURCHASED proxy. Expired proxies are deliberately shown
// rather than hidden (decision 2026-08-04): they are never deleted, so a
// user who loses one must be able to see that it lapsed instead of watching
// it silently disappear. This column is what makes that visible — without
// it an expired proxy renders identically to a working one.
//
// Wording differs from the Custom tab's pill on purpose: for a purchased
// proxy the state is a fact about the subscription ("Expired"), not a prompt
// to investigate ("Check").
function renderPurchasedStatus(p: ViewProxy): React.ReactNode {
  const expired = p.status === 'expired'
  return (
    <div style={{ minWidth: 0 }}>
      <StatusPill state={expired ? 'warn' : 'ready'} label={expired ? 'Expired' : 'Live'} />
      {p.expiresRelative && (
        <div className="ctry-city" title={p.expires_at ?? undefined}>
          {expired ? `expired ${p.expiresRelative}` : `expires ${p.expiresRelative}`}
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
  // minPx values are MEASURED from the real rendered text (longest realistic
  // content per column) plus room for the icons/badges each cell carries.
  // e.g. "140.235.23.51:63295" is 149px at mono/13px, + 38px proto badge + gap.
  {
    key: 'ip',
    header: 'IP Address',
    width: 'minmax(240px,2.2fr)',
    // +30px over the pre-copy-button measurement to fit the 22px button + gap.
    minPx: 240,
    cell: (p, h) => renderHost(p, h)
  },
  // "TP 140.235.23.51:63295" measures 127px.
  {
    key: 'tag',
    header: 'Tag',
    width: 'minmax(0,0.9fr)',
    minPx: 175,
    cell: (p, h) => renderTag(p, h)
  },
  {
    key: 'username',
    header: 'Username',
    width: 'minmax(0,0.9fr)',
    minPx: 90,
    // Expired proxies come back with credentials stripped server-side, so
    // say why the value is gone instead of rendering a bare dash.
    cell: (p) =>
      p.status === 'expired' ? (
        <span className="px-ro" style={{ color: 'var(--t4)' }}>
          Unavailable
        </span>
      ) : (
        <span className="px-ro">{p.username || '—'}</span>
      )
  },
  {
    // Dots + reveal + copy icons.
    key: 'password',
    header: 'Password',
    width: 'minmax(0,0.9fr)',
    minPx: 110,
    cell: (p) => <RevealPassword password={p.password_encrypted} blocked={p.status === 'expired'} />
  },
  {
    // Flag + country name + city sub-line.
    key: 'location',
    header: 'Location',
    width: 'minmax(0,0.8fr)',
    minPx: 150,
    cell: (p) => renderCountry(p)
  },
  {
    key: 'type',
    header: 'Type',
    width: 'minmax(0,0.6fr)',
    minPx: 60,
    cell: (p) => <span className="px-type">{protoLabel(p)}</span>
  },
  {
    // Pill over "expires in 29 days" (93px).
    key: 'status',
    header: 'Status',
    width: 'minmax(0,0.9fr)',
    minPx: 105,
    cell: (p) => renderPurchasedStatus(p)
  },
  {
    key: 'profiles',
    header: 'Profiles',
    // Wider than the old count-only cell: now carries "#1, #12, #35".
    width: 'minmax(0,1.1fr)',
    minPx: 130,
    cell: (p) => renderProfiles(p)
  }
]

// ---- Custom tab ------------------------------------------------------------
// Keeps TubeGhost's existing layout (# · IP · Country · Profiles · Tags · Status).
// The leading select + sortable "#" and the trailing actions column are owned
// by the table shell (shared with the TubeProxies tab), so they are NOT here.
export const CUSTOM_COLUMNS: ColumnConfig[] = [
  {
    key: 'ip',
    header: 'IP',
    // A 0 minimum let this track shrink below its content, so the copy button
    // overflowed into Country. Floor it at the width of a full IPv4:port plus
    // the proto badge and the button.
    width: 'minmax(240px,1.6fr)',
    minPx: 240,
    cell: (p, h) => renderHost(p, h)
  },
  {
    key: 'country',
    header: 'Country',
    width: 'minmax(0,1.3fr)',
    minPx: 150,
    cell: (p) => renderCountry(p)
  },
  {
    key: 'profiles',
    header: 'Profiles',
    // Wider than the old count-only cell: now carries "#1, #12, #35".
    width: 'minmax(0,1.1fr)',
    minPx: 130,
    cell: (p) => renderProfiles(p)
  },
  {
    key: 'tags',
    header: 'Tags',
    width: 'minmax(0,0.95fr)',
    minPx: 175,
    cell: (p, h) => renderTag(p, h)
  },
  {
    key: 'status',
    header: 'Status',
    width: 'minmax(0,0.9fr)',
    minPx: 105,
    cell: (p) => renderStatus(p)
  }
]
