// Modal profile picker for "Assign to profile" (available from either tab).
// Lists the workspace's profiles with search and copies the chosen proxy onto
// the selected profile via the existing assignProxyToProfile() denormalised
// write. Kept intentionally small; RLS enforces the actual permission.

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { assignProxyToProfile, listProfiles, type ProfileRow } from '@/lib/profiles'
import type { ProxyRow } from '@/lib/proxies'

export function AssignProfilePopover({
  proxy,
  workspaceId,
  onClose,
  onAssigned
}: {
  proxy: ProxyRow
  workspaceId: string
  onClose: () => void
  onAssigned: (profile: ProfileRow) => void
}): React.ReactElement {
  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listProfiles(workspaceId)
      .then((rows) => !cancelled && setProfiles(rows))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    if (!profiles) return []
    const needle = q.trim().toLowerCase()
    if (!needle) return profiles
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) || String(p.profile_number ?? '').includes(needle)
    )
  }, [profiles, q])

  const assign = async (profile: ProfileRow): Promise<void> => {
    setBusy(profile.id)
    setError(null)
    try {
      await assignProxyToProfile(profile.id, {
        id: proxy.id,
        proxy_type: proxy.proxy_type,
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        password_encrypted: proxy.password_encrypted,
        source: proxy.source,
        tubeproxies_ip_id: proxy.tubeproxies_ip_id
      })
      onAssigned(profile)
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <div className="assign-scrim" onMouseDown={onClose}>
      <div className="assign-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="assign-head">
          <div>
            <div className="assign-title">Assign to profile</div>
            <div className="assign-sub">
              {proxy.host}:{proxy.port}
            </div>
          </div>
          <button className="assign-x" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="pop-search" style={{ borderTop: '1px solid var(--line)' }}>
          <Search />
          <input
            autoFocus
            placeholder="Search profiles by name or #…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {error && <div className="assign-err">{error}</div>}

        <div className="assign-list">
          {profiles === null ? (
            <div className="pop-empty">Loading profiles…</div>
          ) : filtered.length === 0 ? (
            <div className="pop-empty">No matching profiles.</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                className="assign-opt"
                disabled={busy !== null}
                onClick={() => assign(p)}
              >
                <span className="assign-num">#{p.profile_number ?? '—'}</span>
                <span className="assign-name">{p.name}</span>
                {p.proxy_host && <span className="assign-cur">has proxy</span>}
                {busy === p.id && <span className="assign-cur">assigning…</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
