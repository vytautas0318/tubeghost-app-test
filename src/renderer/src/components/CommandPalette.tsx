import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft, Plus, AppWindow } from 'lucide-react'
import { listProfiles, type ProfileRow } from '@/lib/profiles'
import { useWorkspace } from '@/store/workspace'
import { NavIcon } from './sidebar/navIcons'

// Fired by the Sidebar "Search everything" button; ⌘K / Ctrl+K also opens it.
export const OPEN_SEARCH_EVENT = 'tg:open-search'

type Item = {
  key: string
  group: 'Pages' | 'Profiles' | 'Actions'
  label: string
  hint?: string
  icon: React.ReactNode
  to: string
}

const PAGES: { label: string; to: string; icon: string; keywords?: string }[] = [
  { label: 'Profiles', to: '/profiles', icon: 'profiles' },
  { label: 'Proxies', to: '/proxies', icon: 'proxies' },
  {
    label: 'Buy proxies',
    to: '/buy-proxies',
    icon: 'briefcase',
    keywords: 'tubeproxies purchase ip'
  },
  { label: 'Authenticator', to: '/authenticator', icon: 'shield', keywords: '2fa totp' },
  { label: 'Phone numbers', to: '/phone', icon: 'phone', keywords: 'sms verification' },
  { label: 'Extensions', to: '/extensions', icon: 'extensions', keywords: 'chrome addons' },
  { label: 'Automations', to: '/automations', icon: 'automation', keywords: 'flows' },
  { label: 'Members', to: '/team/members', icon: 'members', keywords: 'team invite' },
  { label: 'Roles & access', to: '/team/roles', icon: 'roles', keywords: 'permissions' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
  { label: 'Billing', to: '/billing', icon: 'billing', keywords: 'plan invoices subscription' }
]

export function CommandPalette(): React.ReactElement | null {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null)
  const workspaceId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const show = useCallback((): void => {
    setQuery('')
    setCursor(0)
    setOpen(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => {
          if (!v) {
            setQuery('')
            setCursor(0)
          }
          return !v
        })
      }
    }
    const onOpen = (): void => show()
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
    }
  }, [show])

  // Lazy-load workspace profiles the first time the palette opens.
  useEffect(() => {
    if (!open || profiles !== null || !workspaceId) return
    listProfiles(workspaceId)
      .then(setProfiles)
      .catch(() => setProfiles([]))
  }, [open, profiles, workspaceId])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (...hay: (string | null | undefined)[]): boolean =>
      !q || hay.some((h) => (h ?? '').toLowerCase().includes(q))

    const pages: Item[] = PAGES.filter((p) => match(p.label, p.keywords)).map((p) => ({
      key: 'page:' + p.to,
      group: 'Pages' as const,
      label: p.label,
      icon: <NavIcon name={p.icon} size={15} />,
      to: p.to
    }))

    const profs: Item[] = (profiles ?? [])
      .filter((p) => match(p.name, (p.tags ?? []).join(' '), p.proxy_host))
      .slice(0, 8)
      .map((p) => ({
        key: 'profile:' + p.id,
        group: 'Profiles' as const,
        label: p.name,
        hint: (p.tags ?? []).slice(0, 3).join(' · ') || undefined,
        icon: <AppWindow size={15} />,
        to: '/profiles/' + p.id
      }))

    const actions: Item[] = [
      { label: 'Create profile', to: '/profiles/new', keywords: 'new add' },
      { label: 'Bulk create profiles', to: '/bulk', keywords: 'batch' }
    ]
      .filter((a) => match(a.label, a.keywords))
      .map((a) => ({
        key: 'action:' + a.to,
        group: 'Actions' as const,
        label: a.label,
        icon: <Plus size={15} />,
        to: a.to
      }))

    // With no query: pages first. With a query: profiles first (most specific).
    return q ? [...profs, ...pages, ...actions] : [...pages.slice(0, 6), ...profs, ...actions]
  }, [query, profiles])

  // Clamp at render time (no effect) so a shrinking result list can't leave
  // the highlight out of range.
  const safeCursor = Math.min(cursor, Math.max(0, items.length - 1))

  const go = (item: Item): void => {
    setOpen(false)
    navigate(item.to)
  }

  if (!open) return null

  let lastGroup: string | null = null
  return (
    <div
      className="fixed inset-0 z-[300] bg-black/35 flex items-start justify-center pt-[14vh]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="w-[560px] max-w-[calc(100vw-48px)] bg-[var(--panel)] border border-[var(--line)] rounded-[var(--r-lg)] shadow-[var(--shadow-pop)] overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-[var(--line)]">
          <Search size={16} className="text-[var(--t3)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor(Math.min(safeCursor + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor(Math.max(safeCursor - 1, 0))
              } else if (e.key === 'Enter' && items[safeCursor]) {
                e.preventDefault()
                go(items[safeCursor])
              }
            }}
            placeholder="Search profiles, pages, actions…"
            className="flex-1 bg-transparent text-sm text-[var(--t1)] placeholder:text-[var(--t4)] focus:outline-none"
          />
          <kbd className="mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--panel-2)] border border-[var(--line)] text-[var(--t3)]">
            esc
          </kbd>
        </div>

        <div className="max-h-[46vh] overflow-auto py-1.5">
          {items.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[var(--t3)]">
              No results for “{query}”
            </div>
          )}
          {items.map((item, i) => {
            const header =
              item.group !== lastGroup ? (
                <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--t3)]">
                  {item.group}
                </div>
              ) : null
            lastGroup = item.group
            return (
              <React.Fragment key={item.key}>
                {header}
                <button
                  onClick={() => go(item)}
                  onMouseMove={() => setCursor(i)}
                  className={
                    'w-full text-left px-4 py-2 flex items-center gap-2.5 text-[13px] ' +
                    (i === safeCursor ? 'bg-[var(--hover)]' : '')
                  }
                >
                  <span className="text-[var(--t3)] shrink-0 inline-flex">{item.icon}</span>
                  <span className="text-[var(--t1)] font-medium truncate">{item.label}</span>
                  {item.hint && (
                    <span className="text-[11px] text-[var(--t3)] truncate">{item.hint}</span>
                  )}
                  {i === safeCursor && (
                    <CornerDownLeft size={13} className="ml-auto text-[var(--t4)] shrink-0" />
                  )}
                </button>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}
