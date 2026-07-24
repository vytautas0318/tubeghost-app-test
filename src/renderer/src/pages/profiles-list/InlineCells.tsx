// Inline editors for the Profiles list — clicking a Tags / Group /
// Proxy cell opens a small popover instead of navigating to the
// editor. Edit-permission gated; falls back to read-only display
// when the user can't edit.

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Globe } from 'lucide-react'
import {
  assignProxyToProfile,
  clearProfileProxy,
  type ProfileRow as ProfileRowType
} from '@/lib/profiles'
import { listProxies, type ProxyRow } from '@/lib/proxies'
import { useAnchoredPopover } from './useAnchoredPopover'
import { flagEmoji } from './osFlag'

// TagsCell + GroupCell moved to their own files (shared-tag color support /
// group search + inline edit). Re-exported here so existing imports from
// './InlineCells' keep working.
export { TagsCell } from './TagsCell'
export { GroupCell } from './GroupCell'

const stop = (e: React.MouseEvent | React.SyntheticEvent): void => e.stopPropagation()

// ---------- ProxyCell ----------

export function ProxyCell({
  raw,
  meta,
  workspaceId,
  canEdit,
  onChanged
}: {
  raw: ProfileRowType
  // Workspace proxy matching this profile's host:port (for flag + location).
  meta?: ProxyRow | null
  workspaceId: string
  canEdit: boolean
  onChanged: () => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [proxies, setProxies] = useState<ProxyRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const { triggerRef, panelRef, style } = useAnchoredPopover(open, setOpen, 320)

  // Lazy-load proxies the first time the popover opens.
  useEffect(() => {
    if (!open || proxies !== null || loading) return
    setLoading(true)
    listProxies(workspaceId)
      .then(setProxies)
      .catch(() => setProxies([]))
      .finally(() => setLoading(false))
  }, [open, proxies, loading, workspaceId])

  const filtered = useMemo(() => {
    if (!proxies) return []
    const q = search.trim().toLowerCase()
    return proxies
      .filter((p) => p.status === 'active')
      .filter((p) => {
        if (!q) return true
        return (
          p.host.toLowerCase().includes(q) ||
          (p.label ?? '').toLowerCase().includes(q) ||
          (p.country_code ?? '').toLowerCase().includes(q) ||
          (p.country_name ?? '').toLowerCase().includes(q) ||
          (p.city ?? '').toLowerCase().includes(q)
        )
      })
      .slice(0, 50)
  }, [proxies, search])

  const assigned = raw.proxy_host
    ? `${raw.proxy_host}${raw.proxy_port ? ':' + raw.proxy_port : ''}`
    : null
  const source =
    raw.proxy_source && raw.proxy_source !== 'custom'
      ? raw.proxy_source.charAt(0).toUpperCase() + raw.proxy_source.slice(1)
      : raw.proxy_source === 'custom'
        ? 'Custom'
        : null
  // Flag + "US · Phoenix · Astound"-style location line (from the matched
  // workspace proxy). Falls back to the source when no geo is known.
  const flag = flagEmoji(meta?.country_code)
  const loc =
    [meta?.country_code?.toUpperCase(), meta?.city, source].filter(Boolean).join(' · ') ||
    source ||
    null
  const leadIcon = flag ? (
    <span className="text-[12.5px] leading-none shrink-0">{flag}</span>
  ) : (
    <Globe className="w-3 h-3 text-[var(--red)] shrink-0" />
  )

  const assign = async (p: ProxyRow): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      await assignProxyToProfile(raw.id, {
        id: p.id,
        proxy_type: p.proxy_type,
        host: p.host,
        port: p.port,
        username: p.username,
        password_encrypted: p.password_encrypted,
        source: p.source,
        tubeproxies_ip_id: p.tubeproxies_ip_id
      })
      setOpen(false)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const clear = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      await clearProfileProxy(raw.id)
      setOpen(false)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) {
    return assigned ? (
      <div className="leading-tight">
        <span className="inline-flex items-center gap-1.5 mono text-[12.5px] text-[var(--t1)]">
          {leadIcon}
          {assigned}
        </span>
        {loc && <div className="text-[11px] text-[var(--t3)] font-sans mt-0.5">{loc}</div>}
      </div>
    ) : (
      <span className="text-[12px] italic text-[var(--t4)] font-sans">No proxy assigned</span>
    )
  }

  return (
    <div className="relative" onClick={stop}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="text-left rounded px-1.5 -mx-1.5 py-0.5 transition-colors block min-w-[60px] group-hover:hover:bg-[var(--hover)]"
      >
        {assigned ? (
          <span className="leading-tight block">
            <span className="inline-flex items-center gap-1.5 mono text-[12.5px] text-[var(--t1)]">
              {leadIcon}
              {assigned}
            </span>
            {loc && (
              <span className="block text-[11px] text-[var(--t3)] font-sans mt-0.5">{loc}</span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[12px] text-[var(--t4)] italic hover:text-[var(--red)] font-sans">
            <Globe className="w-3 h-3" />
            No proxy assigned
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            onClick={stop}
            className="z-50 w-80 bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)]"
          >
            <div className="p-2 border-b border-[var(--line)]">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search or paste IP:port…"
                className="w-full px-2 py-1.5 text-xs bg-[var(--panel-2)] border border-[var(--line)] rounded-[var(--r-sm)] text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30"
              />
            </div>
            <div className="max-h-60 overflow-auto py-1">
              {assigned && (
                <button
                  onClick={() => void clear()}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--red-soft)] text-[var(--red)] flex items-center gap-2"
                >
                  <X className="w-3 h-3" />
                  Remove proxy from profile
                </button>
              )}
              {assigned && filtered.length > 0 && (
                <div className="my-1 border-t border-[var(--line-2)]" />
              )}
              {loading && (
                <div className="px-3 py-2 text-xs text-[var(--t3)]">Loading proxies…</div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="px-3 py-2 text-xs text-[var(--t3)] italic">
                  {proxies && proxies.length === 0
                    ? 'No proxies in this workspace yet.'
                    : 'No matches.'}
                </div>
              )}
              {filtered.map((p) => {
                const isCurrent = p.host === raw.proxy_host && p.port === raw.proxy_port
                return (
                  <button
                    key={p.id}
                    onClick={() => void assign(p)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--hover)]"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="w-3 h-3 text-[var(--red)] shrink-0" />
                      <span className="mono text-[var(--t1)] truncate">
                        {p.host}:{p.port}
                      </span>
                      {p.country_code && (
                        <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-[var(--hover)] text-[var(--t3)]">
                          {p.country_code}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="ml-auto text-[10px] text-[var(--red)] font-semibold">
                          ✓
                        </span>
                      )}
                    </div>
                    {(p.city || p.label) && (
                      <div className="text-[10px] text-[var(--t3)] mt-0.5 truncate pl-[18px]">
                        {[p.country_code, p.city].filter(Boolean).join(' · ') || p.label}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
