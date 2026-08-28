// Toolbar "Proxy" dropdown. Keeps the original Any / Has proxy / No proxy
// modes and adds a searchable multi-select list of the workspace's proxies, so
// you can answer "which profiles are on THIS proxy?" — the question that comes
// up whenever a proxy dies, expires, or has its protocol changed.
//
// Mode and specific-proxy selection are mutually exclusive by construction:
// picking proxies clears the mode (picking one already implies "has a proxy"),
// and picking a mode clears the proxies. applyFilters gives proxyIds priority
// either way, so the two can never disagree.

import * as React from 'react'
import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { PROXY_LABELS, type FilterState, type ProxyFilter } from './filterTypes'

export interface ProxyOption {
  // host:port — the key applyFilters matches on.
  key: string
  label: string
  // Profiles currently assigned to it, so the list can say what's in use.
  count: number
}

export function ProxyFilterMenu({
  state,
  options,
  onChange,
  close
}: {
  state: FilterState
  options: ProxyOption[]
  onChange: (next: FilterState) => void
  close: () => void
}): React.ReactElement {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => o.label.toLowerCase().includes(needle))
  }, [options, q])

  const selected = new Set(state.proxyIds)

  const pickMode = (v: ProxyFilter): void => {
    onChange({ ...state, proxy: v, proxyIds: [] })
    close()
  }

  const toggle = (key: string): void => {
    const next = selected.has(key)
      ? state.proxyIds.filter((k) => k !== key)
      : [...state.proxyIds, key]
    // Selecting a specific proxy supersedes the any/has/none mode.
    onChange({ ...state, proxy: 'any', proxyIds: next })
  }

  return (
    <div className="w-64">
      <div className="py-1">
        {(Object.keys(PROXY_LABELS) as ProxyFilter[]).map((k) => {
          const active = state.proxyIds.length === 0 && state.proxy === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => pickMode(k)}
              className={
                'w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-[var(--hover)] ' +
                (active ? 'text-[var(--red)] font-semibold' : 'text-[var(--t1)]')
              }
            >
              {PROXY_LABELS[k]}
              {active && <Check className="w-3.5 h-3.5" />}
            </button>
          )
        })}
      </div>

      {options.length > 0 && (
        <>
          <div className="border-t border-[var(--line)]" />
          <div className="px-2 py-2">
            <div className="pop-search">
              <Search />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search proxy…"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-[var(--t3)]">No proxy matches.</p>
            )}
            {filtered.map((o) => {
              const on = selected.has(o.key)
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => toggle(o.key)}
                  className={
                    'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-[var(--hover)] ' +
                    (on ? 'text-[var(--t1)]' : 'text-[var(--t2)]')
                  }
                >
                  <span
                    className={
                      'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ' +
                      (on ? 'bg-[var(--red)] border-[var(--red)]' : 'border-[var(--line)]')
                    }
                  >
                    {on && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <span className="font-mono truncate flex-1">{o.label}</span>
                  <span className="text-[10.5px] text-[var(--t3)] shrink-0">{o.count}</span>
                </button>
              )
            })}
          </div>

          {state.proxyIds.length > 0 && (
            <>
              <div className="border-t border-[var(--line)]" />
              <button
                type="button"
                onClick={() => onChange({ ...state, proxyIds: [] })}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--t3)] hover:text-[var(--t1)]"
              >
                Clear proxy selection
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
