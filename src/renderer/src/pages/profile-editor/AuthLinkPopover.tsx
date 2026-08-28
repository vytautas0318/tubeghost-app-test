// The Authenticator tile's link/add popover.
//
// Split from SimpleAuthField so that file stays the tile (linked state + the
// data calls) and this is the panel. Presentational: every mutation is a
// callback, so the popover never talks to Supabase itself.

import * as React from 'react'
import { Search } from 'lucide-react'
import { SaSelect } from './SaSelect'
import type { AuthPlatform, AuthTokenRow } from '@tubeghost/ui'

export interface NewTokenDraft {
  platform: AuthPlatform
  handle: string
  secret: string
}

export function AuthLinkPopover({
  tab,
  setTab,
  q,
  setQ,
  list,
  busy,
  draft,
  setDraft,
  services,
  onLink,
  onAddAndLink
}: {
  tab: 'link' | 'new'
  setTab: (t: 'link' | 'new') => void
  q: string
  setQ: (v: string) => void
  list: AuthTokenRow[]
  busy: boolean
  draft: NewTokenDraft
  setDraft: (fn: (d: NewTokenDraft) => NewTokenDraft) => void
  services: { value: AuthPlatform; label: string }[]
  onLink: (t: AuthTokenRow) => void
  onAddAndLink: () => void
}): React.ReactElement {
  return (
    <div className="sa-px-pop" role="dialog" aria-label="Link or add an authenticator token">
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
              value={q}
              placeholder="Search issuer or handle…"
              aria-label="Search tokens"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="sa-px-list">
            {list.map((t) => (
              <button
                type="button"
                key={t.id}
                className="sa-px-opt"
                disabled={busy}
                onClick={() => onLink(t)}
              >
                <span className="sa-px-ip sans">
                  {t.issuer}
                  {t.handle ? ` · ${t.handle}` : ''}
                </span>
                <span className="sa-px-loc">
                  {t.assigned_profile_id ? 'Assigned' : 'Unassigned'}
                </span>
              </button>
            ))}
            {list.length === 0 && (
              <div className="sa-px-empty">{q ? `No token matches “${q}”.` : 'No tokens yet.'}</div>
            )}
          </div>
        </>
      ) : (
        <div className="sa-form">
          <div className="sa-ff">
            <label htmlFor="nt-issuer">Service</label>
            <SaSelect
              value={draft.platform}
              ariaLabel="Service"
              onChange={(v) => setDraft((d) => ({ ...d, platform: v as AuthPlatform }))}
              options={services.map((s) => ({ value: s.value, label: s.label }))}
            />
          </div>
          <div className="sa-ff">
            <label htmlFor="nt-handle">Account handle</label>
            <input
              id="nt-handle"
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
              onChange={(e) => setDraft((v) => ({ ...v, secret: e.target.value.toUpperCase() }))}
            />
            <span className="sa-fhint">
              Paste the key from the service&rsquo;s 2FA screen, or scan the QR after saving.
            </span>
          </div>
          <button
            type="button"
            className="sa-form-go"
            disabled={busy || !draft.handle.trim() || !draft.secret.trim()}
            onClick={() => onAddAndLink()}
          >
            {busy ? 'Adding…' : 'Add & link'}
          </button>
        </div>
      )}
    </div>
  )
}
