// Simple-mode proxy picker: one compact select + a searchable dropdown.
//
// The Advanced tab keeps the full ProxyPicker (filter chips, used/tested
// counts, workspace-pool vs custom-inline tabs). This reads the SAME source —
// listProxies(workspace_id) — so every proxy the pool list can reach is
// reachable here too; the Advanced chips are filters over that list, not extra
// sources.

import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, Shuffle } from 'lucide-react'
import { listProxies, listUnusedProxies, type ProxyRow } from '@/lib/proxies'
import { useWorkspace } from '@/store/workspace'

export function SimpleProxySelect({
  currentHost,
  currentPort,
  disabled,
  onPick,
  onClear
}: {
  currentHost: string | null
  currentPort: number | null
  disabled: boolean
  onPick: (p: ProxyRow) => void
  onClear: () => void
}): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const [rows, setRows] = useState<ProxyRow[]>([])
  // Ids of proxies no profile is using yet, best-candidate-first. Kept as a
  // separate list (not a filter over `rows`) because "unused" needs the
  // workspace-wide usage map, which only listUnusedProxies computes.
  const [unused, setUnused] = useState<ProxyRow[]>([])
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  // Mirrors the Advanced picker's chips so the two surfaces read the same way.
  // 'used' is included here (Advanced offers 'tested' instead) because the
  // Simple list has no test column — used/unused is the distinction that
  // matters when you are picking one proxy for one profile.
  const [filter, setFilter] = useState<'all' | 'unused' | 'used'>('all')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    listProxies(workspace.workspace_id)
      .then((ps) => !cancelled && setRows(ps))
      .catch(() => undefined)
    listUnusedProxies(workspace.workspace_id)
      .then((ps) => !cancelled && setUnused(ps))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // currentHost/currentPort are deliberate deps, not accidental: assigning a
    // proxy makes it used, so the free list must be recomputed or the count and
    // the badges would keep advertising a proxy this profile just took.
  }, [workspace, currentHost, currentPort])

  const unusedIds = useMemo(() => new Set(unused.map((p) => p.id)), [unused])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const current = useMemo(
    () => rows.find((r) => r.host === currentHost && r.port === currentPort) ?? null,
    [rows, currentHost, currentPort]
  )

  // Counts are over the SEARCH-matched set, not the whole pool, so the chip
  // numbers always describe what switching to that chip would actually show.
  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) =>
      `${r.host}:${r.port} ${r.city ?? ''} ${r.country_code ?? ''} ${r.label ?? ''}`
        .toLowerCase()
        .includes(needle)
    )
  }, [rows, q])

  const counts = useMemo(
    () => ({
      all: searched.length,
      unused: searched.filter((r) => unusedIds.has(r.id)).length,
      used: searched.filter((r) => !unusedIds.has(r.id)).length
    }),
    [searched, unusedIds]
  )

  const list = useMemo(() => {
    if (filter === 'unused') return searched.filter((r) => unusedIds.has(r.id))
    if (filter === 'used') return searched.filter((r) => !unusedIds.has(r.id))
    return searched
  }, [searched, filter, unusedIds])

  const label = currentHost
    ? `${currentHost}:${currentPort}` +
      (current?.city
        ? `  ·  ${current.city}`
        : current?.country_code
          ? `  ·  ${current.country_code}`
          : '')
    : 'No proxy assigned'

  return (
    <div className="sa-px" ref={wrapRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="sa-sel"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setQ('')
          setOpen((v) => !v)
        }}
      >
        <span className={currentHost ? '' : 'none'}>{label}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="sa-px-pop" role="listbox">
          <div className="sa-px-search">
            <Search />
            <input
              autoFocus
              value={q}
              placeholder="Search IP, city, label…"
              aria-label="Search proxies"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {/* Filter chips, matching the Advanced picker. */}
          <div className="sa-px-filters" role="tablist" aria-label="Filter proxies">
            {(['all', 'unused', 'used'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filter === k}
                className={'sa-px-chip' + (filter === k ? ' on' : '')}
                onClick={() => setFilter(k)}
              >
                {k === 'all' ? 'All' : k === 'unused' ? 'Unused' : 'Used'}
                <span className="sa-px-chip-n">{counts[k]}</span>
              </button>
            ))}
          </div>
          {/* One-click "give me a proxy nobody else is on". Picks the best
              candidate (tested-OK first) so the common case — one fresh proxy
              per profile — doesn't require reading the whole list. Hidden once
              the pool is exhausted rather than left as a dead button. */}
          {unused.length > 0 && (
            <button
              type="button"
              className="sa-px-auto"
              onClick={() => {
                onPick(unused[0])
                setOpen(false)
              }}
            >
              <Shuffle />
              Assign unused proxy
              <span className="sa-px-auto-n">{unused.length} free</span>
            </button>
          )}
          <div className="sa-px-list">
            {list.map((r) => {
              const on = r.host === currentHost && r.port === currentPort
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  key={r.id}
                  className={'sa-px-opt' + (on ? ' on' : '')}
                  onClick={() => {
                    onPick(r)
                    setOpen(false)
                  }}
                >
                  <span className="sa-px-ip">
                    {r.host}:{r.port}
                  </span>
                  <span className="sa-px-loc">
                    {[r.city, r.country_code, r.label].filter(Boolean).join(' · ')}
                  </span>
                  {/* Redundant once the list is already filtered to unused. */}
                  {filter !== 'unused' && unusedIds.has(r.id) && (
                    <span className="sa-px-free">Unused</span>
                  )}
                  {on && (
                    <span className="sa-px-check">
                      <Check />
                    </span>
                  )}
                </button>
              )
            })}
            {list.length === 0 && (
              <div className="sa-px-empty">
                {q
                  ? `No proxy matches “${q}”.`
                  : filter === 'unused'
                    ? 'Every proxy is already assigned to a profile.'
                    : filter === 'used'
                      ? 'No proxy is assigned to a profile yet.'
                      : 'No proxies in this workspace yet.'}
              </div>
            )}
          </div>
          {currentHost && (
            <button
              type="button"
              className="sa-px-clear"
              onClick={() => {
                onClear()
                setOpen(false)
              }}
            >
              Remove proxy
            </button>
          )}
        </div>
      )}
    </div>
  )
}
