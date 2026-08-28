// Inline editors for the Profiles list — clicking a Tags / Group /
// Proxy cell opens a small popover instead of navigating to the
// editor. Edit-permission gated; falls back to read-only display
// when the user can't edit.

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Globe } from 'lucide-react'
import {
  assignProxyToProfile,
  clearProfileProxy,
  type ProfileRow as ProfileRowType
} from '@/lib/profiles'
import { listProxies, listUnusedProxies, type ProxyRow } from '@/lib/proxies'
import { useAnchoredPopover } from './useAnchoredPopover'
import { type ProxyUseFilter } from './ProxyFilterChips'
import { ProxyPickerPanel } from './ProxyPickerPanel'
import { Flag } from '@/components/Flag'
import { hasFlag } from '@/lib/flags'

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
  // Pass the updated row so the page can patch it in place; calling with no
  // argument falls back to a full refetch (for changes that affect more than
  // this one row).
  onChanged: (updated?: ProfileRowType) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [proxies, setProxies] = useState<ProxyRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  // Same All / Unused / Used chips the profile-editor's picker offers, so the
  // two proxy pickers behave identically wherever a proxy is chosen.
  const [unused, setUnused] = useState<ProxyRow[]>([])
  const [filter, setFilter] = useState<ProxyUseFilter>('all')
  const { triggerRef, panelRef, style } = useAnchoredPopover(open, setOpen, 320)

  // Lazy-load proxies the first time the popover opens.
  useEffect(() => {
    if (!open || proxies !== null || loading) return
    setLoading(true)
    listProxies(workspaceId)
      .then(setProxies)
      .catch(() => setProxies([]))
      .finally(() => setLoading(false))
    listUnusedProxies(workspaceId)
      .then(setUnused)
      .catch(() => setUnused([]))
  }, [open, proxies, loading, workspaceId])

  const unusedIds = useMemo(() => new Set(unused.map((p) => p.id)), [unused])

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

  // Counts describe the search-matched set, so a chip never advertises rows the
  // current search would hide.
  const counts = useMemo(
    () => ({
      all: filtered.length,
      unused: filtered.filter((p) => unusedIds.has(p.id)).length,
      used: filtered.filter((p) => !unusedIds.has(p.id)).length
    }),
    [filtered, unusedIds]
  )

  const shown = useMemo(() => {
    if (filter === 'unused') return filtered.filter((p) => unusedIds.has(p.id))
    if (filter === 'used') return filtered.filter((p) => !unusedIds.has(p.id))
    return filtered
  }, [filtered, filter, unusedIds])

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
  const loc =
    [meta?.country_code?.toUpperCase(), meta?.city, source].filter(Boolean).join(' · ') ||
    source ||
    null
  // Real flag image when the proxy's country is known, globe otherwise.
  const leadIcon = hasFlag(meta?.country_code) ? (
    <Flag code={meta?.country_code} />
  ) : (
    <Globe className="w-3 h-3 text-[var(--red)] shrink-0" />
  )

  const assign = async (p: ProxyRow): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const updated = await assignProxyToProfile(raw.id, {
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
      onChanged(updated)
    } finally {
      setSaving(false)
    }
  }

  const clear = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const updated = await clearProfileProxy(raw.id)
      setOpen(false)
      onChanged(updated)
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
          <ProxyPickerPanel
            panelRef={panelRef}
            style={style}
            stop={stop}
            search={search}
            setSearch={setSearch}
            filter={filter}
            setFilter={setFilter}
            counts={counts}
            shown={shown}
            proxies={proxies}
            loading={loading}
            assigned={assigned}
            raw={raw}
            onPick={(p) => void assign(p)}
            onClear={() => void clear()}
          />,
          document.body
        )}
    </div>
  )
}
