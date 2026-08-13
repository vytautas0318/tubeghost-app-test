// The "Linked credentials" tile in the editor's Simple mode: three fields
// side by side — Group, Authenticator, Phone number — each a linked chip
// with an unlink ×, or a dashed "Link…" button opening a popover.
//
// Port of the design system's ProfileEditor.jsx `.sa-cred` block. The
// prototype's popovers were mock-backed; these read and write the real
// workspace tables:
//   Group         → groups list + inline create, writes the shared form
//   Authenticator → auth_tokens.assigned_profile_id
//   Phone number  → not linkable in this build; see PhoneField below

import * as React from 'react'
import { useEffect, useState } from 'react'
import { Check, Plus, Search, Shield, Smartphone, X } from 'lucide-react'
import {
  createAuthToken,
  listAuthTokens,
  updateAuthToken,
  type AuthTokenRow
} from '@/lib/authenticator'
import { createGroup, type GroupRow } from '@/lib/groups'

// Groups created from this popover get the neutral default; the Profiles
// page's group manager is where colours are chosen deliberately.
const GROUP_COLOR = '#6B7280'
import type { ProfileRow } from '@/lib/profiles'

type Open = 'grp' | 'auth' | 'phone' | null

export function SimpleCredentials({
  profile,
  groups,
  groupId,
  onGroupChange,
  canEdit,
  workspaceId,
  onToast,
  onNavigate
}: {
  profile: ProfileRow
  groups: GroupRow[]
  groupId: string | null
  onGroupChange: (id: string | null) => void
  canEdit: boolean
  workspaceId: string
  onToast: (kind: 'error' | 'info', text: string) => void
  onNavigate: (to: string) => void
}): React.ReactElement {
  const [open, setOpen] = useState<Open>(null)
  const [q, setQ] = useState('')

  // Close on any outside click. Each field stops propagation on its own
  // subtree, so clicking inside a popover keeps it open.
  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openField = (which: Exclude<Open, null>): void => {
    setQ('')
    setOpen(open === which ? null : which)
  }

  const currentGroup = groups.find((g) => g.id === groupId)?.name ?? 'No group'
  const ql = q.trim().toLowerCase()
  const groupMatches = groups.filter((g) => !ql || g.name.toLowerCase().includes(ql))
  const groupExact = groups.some((g) => g.name.toLowerCase() === ql)

  const makeGroup = async (): Promise<void> => {
    const clean = q.trim().slice(0, 28)
    if (!clean) return
    try {
      const row = await createGroup(workspaceId, clean, GROUP_COLOR)
      onGroupChange(row.id)
      setOpen(null)
      onToast('info', `Group “${clean}” created`)
    } catch (e) {
      onToast('error', (e as Error).message)
    }
  }

  return (
    <div className="sa-cred">
      {/* ── group ─────────────────────────────────────────────────── */}
      <div className="sa-cred-f" onClick={(e) => e.stopPropagation()}>
        <label>Group</label>
        <button
          type="button"
          className="sa-grp-btn"
          aria-haspopup="dialog"
          aria-expanded={open === 'grp'}
          disabled={!canEdit}
          onClick={() => openField('grp')}
        >
          <span className="sa-grp-v">{currentGroup}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open === 'grp' && (
          <div className="sa-px-pop" role="dialog" aria-label="Choose or create a group">
            <div className="sa-px-search">
              <Search />
              <input
                autoFocus
                value={q}
                placeholder="Search or create a group…"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ql && !groupExact) void makeGroup()
                }}
              />
            </div>
            <div className="sa-px-list">
              <button
                type="button"
                className={'sa-px-opt' + (!groupId ? ' on' : '')}
                onClick={() => {
                  onGroupChange(null)
                  setOpen(null)
                }}
              >
                <span className="sa-px-ip sans">No group</span>
                {!groupId && (
                  <span className="sa-px-ck">
                    <Check />
                  </span>
                )}
              </button>
              {groupMatches.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  className={'sa-px-opt' + (groupId === g.id ? ' on' : '')}
                  onClick={() => {
                    onGroupChange(g.id)
                    setOpen(null)
                  }}
                >
                  <span className="sa-px-ip sans">{g.name}</span>
                  {groupId === g.id && (
                    <span className="sa-px-ck">
                      <Check />
                    </span>
                  )}
                </button>
              ))}
              {!groupMatches.length && !ql && <div className="sa-px-empty">No groups yet.</div>}
            </div>
            {ql && !groupExact && (
              <button type="button" className="sa-px-new" onClick={() => void makeGroup()}>
                <Plus />
                Create “{q.trim()}”
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── authenticator ─────────────────────────────────────────── */}
      <AuthField
        profile={profile}
        workspaceId={workspaceId}
        canEdit={canEdit}
        open={open === 'auth'}
        query={q}
        onQuery={setQ}
        onOpen={() => openField('auth')}
        onClose={() => setOpen(null)}
        onToast={onToast}
      />

      {/* ── phone number ──────────────────────────────────────────── */}
      <PhoneField onNavigate={onNavigate} />
    </div>
  )
}

// ── authenticator ──────────────────────────────────────────────────
// A token is bound to a profile by auth_tokens.assigned_profile_id, so
// linking is an UPDATE on the token, not a write to the profile row.
function AuthField({
  profile,
  workspaceId,
  canEdit,
  open,
  query,
  onQuery,
  onOpen,
  onClose,
  onToast
}: {
  profile: ProfileRow
  workspaceId: string
  canEdit: boolean
  open: boolean
  query: string
  onQuery: (v: string) => void
  onOpen: () => void
  onClose: () => void
  onToast: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  const [tokens, setTokens] = useState<AuthTokenRow[]>([])
  const [tab, setTab] = useState<'link' | 'new'>('link')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ issuer: 'YouTube', handle: '', secret: '' })

  // Reloaded whenever the popover opens, and after a link/create, so the
  // linked chip reflects a token someone else just re-assigned.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    listAuthTokens(workspaceId)
      .then((t) => !cancelled && setTokens(t))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [workspaceId, tick])

  const linked = tokens.find((t) => t.assigned_profile_id === profile.id) ?? null
  const ql = query.trim().toLowerCase()
  const matches = tokens.filter(
    (t) => !ql || `${t.issuer} ${t.handle ?? ''} ${t.label ?? ''}`.toLowerCase().includes(ql)
  )

  const link = async (t: AuthTokenRow): Promise<void> => {
    setBusy(true)
    try {
      await updateAuthToken(t.id, { assigned_profile_id: profile.id })
      setTick((v) => v + 1)
      onClose()
      onToast('info', 'Authenticator linked')
    } catch (e) {
      onToast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const unlink = async (): Promise<void> => {
    if (!linked) return
    setBusy(true)
    try {
      await updateAuthToken(linked.id, { assigned_profile_id: null })
      setTick((v) => v + 1)
      onToast('info', 'Authenticator unlinked')
    } catch (e) {
      onToast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = async (): Promise<void> => {
    const handle = draft.handle.trim().startsWith('@')
      ? draft.handle.trim()
      : `@${draft.handle.trim()}`
    setBusy(true)
    try {
      await createAuthToken({
        workspace_id: workspaceId,
        platform: 'other',
        issuer: draft.issuer,
        handle,
        secret: draft.secret.trim(),
        assigned_profile_id: profile.id
      })
      setDraft({ issuer: 'YouTube', handle: '', secret: '' })
      setTick((v) => v + 1)
      onClose()
      onToast('info', 'Token added and linked to this profile')
    } catch (e) {
      onToast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sa-cred-f" onClick={(e) => e.stopPropagation()}>
      <label>Authenticator</label>
      {linked ? (
        <div className="sa-linked">
          <span className="sa-lk-ic au">
            <Shield />
          </span>
          <span className="sa-lk-v">
            {linked.issuer}
            {linked.handle ? ` · ${linked.handle}` : ''}
          </span>
          {canEdit && (
            <button
              type="button"
              className="sa-lk-x"
              aria-label="Unlink authenticator"
              disabled={busy}
              onClick={() => void unlink()}
            >
              <X />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="sa-link-btn"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={!canEdit}
          onClick={onOpen}
        >
          <Plus />
          Link or add a token
        </button>
      )}
      {open && (
        <div
          className="sa-px-pop wide"
          role="dialog"
          aria-label="Link or add an authenticator token"
        >
          <div className="sa-ptabs">
            <button
              type="button"
              className={'sa-ptab' + (tab === 'link' ? ' on' : '')}
              onClick={() => setTab('link')}
            >
              Link existing
            </button>
            <button
              type="button"
              className={'sa-ptab' + (tab === 'new' ? ' on' : '')}
              onClick={() => setTab('new')}
            >
              Add new
            </button>
          </div>
          {tab === 'link' ? (
            <>
              <div className="sa-px-search">
                <Search />
                <input
                  autoFocus
                  value={query}
                  placeholder="Search issuer or handle…"
                  onChange={(e) => onQuery(e.target.value)}
                />
              </div>
              <div className="sa-px-list">
                {matches.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className="sa-px-opt col"
                    disabled={busy}
                    onClick={() => void link(t)}
                  >
                    <span className="sa-px-ip">
                      {t.issuer}
                      {t.handle ? ` · ${t.handle}` : ''}
                    </span>
                    <span className="sa-px-loc">
                      {t.assigned_profile_id
                        ? t.assigned_profile_id === profile.id
                          ? 'This profile'
                          : 'Assigned to another profile'
                        : 'Unassigned'}
                    </span>
                  </button>
                ))}
                {!matches.length && (
                  <div className="sa-px-empty">
                    {query ? `No token matches “${query}”.` : 'No tokens yet.'}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="sa-form">
              <div className="sa-ff">
                <label htmlFor="nt-issuer">Service</label>
                <select
                  id="nt-issuer"
                  className="sa-sel plain"
                  value={draft.issuer}
                  onChange={(e) => setDraft((v) => ({ ...v, issuer: e.target.value }))}
                >
                  {['YouTube', 'Google', 'Instagram', 'X', 'TikTok', 'Other'].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sa-ff">
                <label htmlFor="nt-label">Account handle</label>
                <input
                  id="nt-label"
                  className="sa-inp"
                  placeholder="@crimedynasty"
                  value={draft.handle}
                  onChange={(e) => setDraft((v) => ({ ...v, handle: e.target.value }))}
                />
              </div>
              <div className="sa-ff">
                <label htmlFor="nt-secret">Setup key</label>
                <input
                  id="nt-secret"
                  className="sa-inp mono"
                  placeholder="JBSWY3DPEHPK3PXP"
                  value={draft.secret}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, secret: e.target.value.toUpperCase() }))
                  }
                />
                <span className="sa-fhint">Paste the key from the service&apos;s 2FA screen.</span>
              </div>
              <button
                type="button"
                className="sa-form-go"
                disabled={busy || !draft.handle.trim() || !draft.secret.trim()}
                onClick={() => void add()}
              >
                {busy ? 'Adding…' : 'Add & link'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── phone number ───────────────────────────────────────────────────
// The design links (and orders) a number here. This build has no
// number→profile link: lib/phone-numbers.ts exposes the workspace
// overview only, with no assignment column or RPC. Rather than render a
// control that silently does nothing, the field says where the real one
// is. Wiring it needs a phone_number_links table + RPC first.
function PhoneField({ onNavigate }: { onNavigate: (to: string) => void }): React.ReactElement {
  return (
    <div className="sa-cred-f">
      <label>Phone number</label>
      <button type="button" className="sa-link-btn" onClick={() => onNavigate('/phone-numbers')}>
        <Smartphone />
        Open Phone numbers
      </button>
      <span className="sa-fhint">Numbers aren&apos;t linked per profile in this build yet.</span>
    </div>
  )
}
