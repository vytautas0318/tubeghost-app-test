// The editor's Simple mode: one screen instead of four tabs. Port of the
// design system's ProfileEditor.jsx `mode === 'simple'` branch (cards.css
// `.sa-*`) — hero, plain-words guide, then tiles for Proxy, Device &
// engine, Fingerprint, YouTube channel, Linked credentials and Tags.
//
// SAVE MODEL, which differs from the tabs on purpose:
//   * Text fields (name, group, tags) live in the shared `form` and commit
//     with the header's "Save changes", exactly as the General tab does.
//   * Structural picks — proxy, OS, browser, fingerprint, channel — apply
//     IMMEDIATELY, because each is a single deliberate choice with a
//     server round-trip of its own. This mirrors what the Proxy tab
//     already does on pool-pick, and the footer note says so.

import * as React from 'react'
import { useEffect, useState } from 'react'
import {
  Check,
  Fingerprint,
  HelpCircle,
  Loader2,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Search,
  Tag,
  X
} from 'lucide-react'
import { Badge, PlatformIcon, Toggle } from '@/components/ui'
import { GhostAvatar } from '@/components/GhostAvatar'
import { NavIcon } from '@/components/sidebar/navIcons'
import { Flag } from '@/components/Flag'
import { hasFlag } from '@/lib/flags'
import { useWorkspace } from '@/store/workspace'
import { useWorkspaceTags } from '@/lib/useWorkspaceTags'
import { listProxies, type ProxyRow } from '@/lib/proxies'
import type { GroupRow } from '@/lib/groups'
import {
  assignProxyToProfile,
  clearProfileProxy,
  updateProfile,
  type ProfileRow
} from '@/lib/profiles'
import { lookupChannel } from '@/lib/youtube'
import { groupColor, profileFace } from '@/pages/profiles-list/cardVisuals'
import { OsMark } from '@/pages/profiles-list/osFlag'
import { browserVersionsFor, userAgentFor } from './randomize'
import { AskBar } from './AskBar'
import { SimpleCredentials } from './SimpleCredentials'
import { newFingerprintPatch, optimizedPatch, osLabel } from './simpleFingerprint'
import { GUIDE_STEPS } from './simpleEditorState'
import type { FormState } from './types'

type Busy = null | 'proxy' | 'fp' | 'os' | 'opt' | 'ver' | 'chan'

export function SimpleEditor({
  profile,
  form,
  setForm,
  canEdit,
  groups,
  guideOpen,
  onGuideChange,
  onProfileSaved,
  onToast,
  onGoAdvanced,
  onNavigate
}: {
  profile: ProfileRow
  form: FormState
  setForm: (f: FormState) => void
  canEdit: boolean
  groups: GroupRow[]
  // The guide is owned by the page so the header's "New here?" button can
  // reopen it after it has been dismissed.
  guideOpen: boolean
  onGuideChange: (open: boolean) => void
  onProfileSaved: (p: ProfileRow) => void
  onToast: (kind: 'error' | 'info', text: string) => void
  onGoAdvanced: () => void
  onNavigate: (to: string) => void
}): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const [busy, setBusy] = useState<Busy>(null)
  // One proxy fetch for the whole screen: the Proxy tile lists them and the
  // AskBar resolves "the Dallas one" against the same rows.
  const [proxies, setProxies] = useState<ProxyRow[]>([])
  useEffect(() => {
    const ws = workspace?.workspace_id
    if (!ws) return
    let cancelled = false
    listProxies(ws)
      .then((p) => !cancelled && setProxies(p))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [workspace?.workspace_id, profile.proxy_host, profile.proxy_port])

  const groupName = groups.find((g) => g.id === form.group_id)?.name ?? ''

  // One writer for every immediate-apply tile, so they share error
  // handling and the "which tile is busy" state.
  const apply = async (
    kind: Exclude<Busy, null>,
    patch: Parameters<typeof updateProfile>[1],
    note: string
  ): Promise<void> => {
    if (!canEdit || busy) return
    setBusy(kind)
    try {
      onProfileSaved(await updateProfile(profile.id, patch))
      onToast('info', note)
    } catch (e) {
      onToast('error', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="sa">
      {/* ── hero ─────────────────────────────────────────────────── */}
      <div className="sa-hero">
        <span className="sa-face">
          <GhostAvatar
            size={72}
            radius={999}
            color={groupColor(groupName, profile.id)}
            face={profileFace(profile.id)}
            glasses="round"
          />
        </span>
        <input
          className="sa-name"
          value={form.name}
          aria-label="Profile name"
          disabled={!canEdit}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <div className="sa-id">
          <select
            className="sa-grp"
            aria-label="Group"
            disabled={!canEdit}
            value={form.group_id ?? ''}
            onChange={(e) => setForm({ ...form, group_id: e.target.value || null })}
          >
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {profile.profile_number != null && (
            <>
              <span className="sa-sep">·</span>
              <span className="sa-code">{profile.profile_number}</span>
            </>
          )}
        </div>
      </div>

      {/* ── plain-words guide ────────────────────────────────────── */}
      {guideOpen && (
        <div className="sa-guide" id="sa-guide-panel">
          <div className="sa-guide-top">
            <div className="sa-guide-t">
              <HelpCircle />
              How this works, in plain words
            </div>
            <button type="button" className="sa-guide-x" onClick={() => onGuideChange(false)}>
              Got it
            </button>
          </div>
          <ol className="sa-guide-l">
            {GUIDE_STEPS.map(([h, b]) => (
              <li key={h}>
                <b>{h}</b>
                <span>{b}</span>
              </li>
            ))}
          </ol>
          <div className="sa-guide-f">
            Nothing here can break a channel. You can change any of it later.
          </div>
        </div>
      )}

      {/* Sits under the hero so Simple mode's "don't touch 40 fields"
          promise has a natural entry point — the design's words. */}
      <AskBar
        profile={profile}
        form={form}
        setForm={setForm}
        groups={groups}
        groupName={groupName}
        proxies={proxies}
        allTags={form.tags}
        workspaceId={workspace?.workspace_id ?? ''}
        canEdit={canEdit}
        onProfileSaved={onProfileSaved}
        onToast={onToast}
      />

      <div className="sa-grid">
        <ProxyTile
          profile={profile}
          canEdit={canEdit}
          busy={busy === 'proxy'}
          proxies={proxies}
          onBusy={(b) => setBusy(b ? 'proxy' : null)}
          onSaved={onProfileSaved}
          onToast={onToast}
        />

        <DeviceTile profile={profile} canEdit={canEdit} busy={busy} onApply={apply} />

        {/* ── fingerprint ────────────────────────────────────────── */}
        <div className="sa-tile">
          <div className="sa-tk">
            <Fingerprint size={15} />
            Fingerprint
          </div>
          <div className="sa-seedrow">
            <span className="sa-seed">{profile.fingerprint_seed}</span>
            <button
              type="button"
              className="sa-reroll"
              disabled={!canEdit || busy === 'fp'}
              onClick={() =>
                void apply(
                  'fp',
                  newFingerprintPatch(profile.platform, profile.brand_version),
                  'New fingerprint generated'
                )
              }
            >
              <RefreshCw className={busy === 'fp' ? 'animate-spin' : undefined} />
              New
            </button>
          </div>
          <label className="sa-switch">
            <Toggle
              checked={profile.google_optimized === true}
              onChange={(v) =>
                void apply(
                  'opt',
                  optimizedPatch(v),
                  v ? 'Optimized for YouTube' : 'Optimization flag cleared'
                )
              }
            />
            <span>Optimized for YouTube</span>
          </label>
          <div className="sa-hint">Tuned to the signals YouTube reads.</div>
        </div>

        <ChannelTile
          profile={profile}
          canEdit={canEdit}
          busy={busy === 'chan'}
          onBusy={(b) => setBusy(b ? 'chan' : null)}
          onSaved={onProfileSaved}
          onToast={onToast}
        />

        {/* ── linked credentials ─────────────────────────────────── */}
        <div className="sa-tile wide">
          <div className="sa-tk">
            <NavIcon name="shield" size={15} />
            Linked credentials
          </div>
          <SimpleCredentials
            profile={profile}
            groups={groups}
            groupId={form.group_id ?? null}
            onGroupChange={(id) => setForm({ ...form, group_id: id })}
            canEdit={canEdit}
            workspaceId={workspace?.workspace_id ?? ''}
            onToast={onToast}
            onNavigate={onNavigate}
          />
          <div className="sa-hint">
            Pulled on launch — the profile verifies and receives codes without leaving the browser.
          </div>
        </div>

        <TagsTile form={form} setForm={setForm} canEdit={canEdit} onToast={onToast} />
      </div>

      <div className="sa-note">
        WebGL, canvas, audio, fonts and 20+ other signals are generated from the seed automatically.
        Open{' '}
        <button type="button" className="sm-link" onClick={onGoAdvanced}>
          Advanced
        </button>{' '}
        to override any of them. Name, group and tags save with <b>Save changes</b>; the proxy,
        device, fingerprint and channel apply as you pick them.
      </div>
    </div>
  )
}

// ── proxy ──────────────────────────────────────────────────────────
// A compact select opening the design's `.sa-px-pop` — deliberately not
// the full ProxyPicker from the Proxy tab, which brings filter chips and
// a tall list this tile has no room for.
function ProxyTile({
  profile,
  canEdit,
  busy,
  proxies,
  onBusy,
  onSaved,
  onToast
}: {
  profile: ProfileRow
  canEdit: boolean
  busy: boolean
  // Fetched once by SimpleEditor and shared with the AskBar.
  proxies: ProxyRow[]
  onBusy: (b: boolean) => void
  onSaved: (p: ProfileRow) => void
  onToast: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest?.('.sa-px')) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  const current = profile.proxy_host ? `${profile.proxy_host}:${profile.proxy_port}` : null
  const currentMeta =
    proxies.find((p) => p.id === profile.proxy_id) ??
    proxies.find((p) => p.host === profile.proxy_host && p.port === profile.proxy_port)
  const ql = q.trim().toLowerCase()
  const matches = proxies.filter(
    (p) => !ql || `${p.host} ${p.city ?? ''} ${p.label ?? ''}`.toLowerCase().includes(ql)
  )
  // "Spare" = usable and not already on this profile. Expired/released/
  // error proxies are excluded: handing one out in a single click would
  // produce a profile that silently can't connect.
  const spare = proxies.filter((p) => p.id !== profile.proxy_id && p.status === 'active')

  const assign = async (p: ProxyRow): Promise<void> => {
    if (!canEdit || busy) return
    setOpen(false)
    onBusy(true)
    try {
      onSaved(
        await assignProxyToProfile(profile.id, {
          id: p.id,
          proxy_type: p.proxy_type,
          host: p.host,
          port: p.port,
          username: p.username,
          password_encrypted: p.password_encrypted,
          source: p.source,
          tubeproxies_ip_id: p.tubeproxies_ip_id
        })
      )
      onToast('info', `Proxy set to ${p.host}:${p.port}`)
    } catch (e) {
      onToast('error', (e as Error).message)
    } finally {
      onBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    setOpen(false)
    if (!confirm('Remove the proxy from this profile?')) return
    onBusy(true)
    try {
      onSaved(await clearProfileProxy(profile.id))
      onToast('info', 'Proxy removed')
    } catch (e) {
      onToast('error', (e as Error).message)
    } finally {
      onBusy(false)
    }
  }

  return (
    <div className="sa-tile">
      <div className="sa-tk">
        <NavIcon name="proxies" size={15} />
        Proxy
      </div>
      <div className="sa-px" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="sa-sel"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={!canEdit || busy}
          onClick={() => {
            setQ('')
            setOpen((v) => !v)
          }}
        >
          <span className={current ? '' : 'none'}>
            {current
              ? current + (currentMeta?.city ? `  ·  ${currentMeta.city}` : '')
              : 'No proxy assigned'}
          </span>
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
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
            <div className="sa-px-list">
              {matches.map((p) => {
                const on = p.id === profile.proxy_id
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    key={p.id}
                    className={'sa-px-opt' + (on ? ' on' : '')}
                    onClick={() => void assign(p)}
                  >
                    {p.country_code && hasFlag(p.country_code) && (
                      <Flag code={p.country_code} className="w-4 h-3 shrink-0 rounded-[2px]" />
                    )}
                    <span className="sa-px-ip">
                      {p.host}:{p.port}
                    </span>
                    <span className="sa-px-loc">
                      {[p.city, p.label].filter(Boolean).join(' · ')}
                    </span>
                    {on && (
                      <span className="sa-px-ck">
                        <Check />
                      </span>
                    )}
                  </button>
                )
              })}
              {!matches.length && (
                <div className="sa-px-empty">
                  {q ? `No proxy matches “${q}”.` : 'No proxies in this workspace yet.'}
                </div>
              )}
            </div>
            {current && (
              <button type="button" className="sa-px-clear" onClick={() => void remove()}>
                Remove proxy
              </button>
            )}
          </div>
        )}
      </div>

      {!current &&
        (spare.length ? (
          <button
            type="button"
            className="sa-assign"
            disabled={!canEdit || busy}
            onClick={() => void assign(spare[0])}
          >
            <NavIcon name="proxies" size={14} />
            Use an unassigned proxy
            <span>
              {spare[0].host}:{spare[0].port}
            </span>
          </button>
        ) : (
          <div className="sa-none">
            No proxy available in your inventory.{' '}
            <button
              type="button"
              className="sm-link"
              onClick={() => (window.location.hash = '#/buy-proxies')}
            >
              Buy proxies
            </button>
          </div>
        ))}

      <div className="sa-hint">
        {current
          ? 'Timezone, language and location follow this IP.'
          : `${spare.length} ${spare.length === 1 ? 'proxy' : 'proxies'} in your inventory ${spare.length === 1 ? 'is' : 'are'} unassigned.`}
      </div>
    </div>
  )
}

// ── device & engine ────────────────────────────────────────────────
function DeviceTile({
  profile,
  canEdit,
  busy,
  onApply
}: {
  profile: ProfileRow
  canEdit: boolean
  busy: Busy
  onApply: (
    kind: Exclude<Busy, null>,
    patch: Parameters<typeof updateProfile>[1],
    note: string
  ) => Promise<void>
}): React.ReactElement {
  const currentOs = osLabel(profile.platform)
  const versions = browserVersionsFor(profile.platform ?? 'windows')
  const currentMajor = (profile.brand_version ?? '').split('.')[0] || versions[0]

  const switchOs = (next: 'Windows' | 'macOS'): void => {
    if (next === currentOs) return
    // NOT a bare `platform` write — see newFingerprintPatch. The whole
    // device is regenerated so user-agent, GPU, CPU/RAM and resolution
    // stay consistent with the new OS. No confirm: the design has none,
    // and the toast reports what happened.
    void onApply(
      'os',
      newFingerprintPatch(next === 'macOS' ? 'macos' : 'windows', profile.brand_version),
      `Switched to ${next} with a matching device`
    )
  }

  // Changing the Chromium major rewrites the user-agent with it —
  // brand_version and UA disagreeing is itself a detectable signal.
  const switchVersion = (major: string): void => {
    void onApply(
      'ver',
      {
        brand_version: `${major}.0.0.0`,
        user_agent: userAgentFor(profile.platform ?? 'windows', major)
      },
      `Browser set to Chromium ${major}`
    )
  }

  return (
    <div className="sa-tile">
      <div className="sa-tk">
        <Monitor size={15} />
        Device &amp; engine
      </div>
      <div className="sa-pick">
        {(['Windows', 'macOS'] as const).map((o) => (
          <button
            type="button"
            key={o}
            className={'sa-opt' + (currentOs === o ? ' on' : '')}
            disabled={!canEdit || busy === 'os'}
            onClick={() => switchOs(o)}
          >
            <OsMark platform={o === 'macOS' ? 'macos' : 'windows'} className="w-3.5 h-3.5" />
            {o}
          </button>
        ))}
      </div>
      <select
        className="sa-sel sans"
        aria-label="Browser version"
        disabled={!canEdit || busy === 'ver'}
        value={currentMajor}
        onChange={(e) => switchVersion(e.target.value)}
      >
        {versions.map((v, i) => (
          <option key={v} value={v}>
            {i === 0 ? `Latest Chromium ${v}` : `Chromium ${v}`}
          </option>
        ))}
      </select>
      <div className="sa-hint">
        {busy === 'os'
          ? 'Regenerating the device…'
          : 'Latest is recommended. Every signal is generated to match this device.'}
      </div>
    </div>
  )
}

// ── youtube channel ────────────────────────────────────────────────
// Inline fetch, matching the design: paste a URL, press Fetch. No
// popover — the tile is full-width and has the room.
function ChannelTile({
  profile,
  canEdit,
  busy,
  onBusy,
  onSaved,
  onToast
}: {
  profile: ProfileRow
  canEdit: boolean
  busy: boolean
  onBusy: (b: boolean) => void
  onSaved: (p: ProfileRow) => void
  onToast: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  const [url, setUrl] = useState('')
  const channel = profile.youtube_channel ?? null

  const pull = async (): Promise<void> => {
    if (!url.trim() || busy) return
    onBusy(true)
    try {
      const ch = await lookupChannel(url)
      onSaved(await updateProfile(profile.id, { youtube_channel: ch }))
      setUrl('')
      onToast('info', `Pulled ${ch.title} from YouTube`)
    } catch (e) {
      onToast('error', (e as Error).message)
    } finally {
      onBusy(false)
    }
  }

  const unlink = async (): Promise<void> => {
    onBusy(true)
    try {
      onSaved(await updateProfile(profile.id, { youtube_channel: null }))
      onToast('info', 'Channel unlinked')
    } catch (e) {
      onToast('error', (e as Error).message)
    } finally {
      onBusy(false)
    }
  }

  return (
    <div className="sa-tile wide">
      <div className="sa-tk">
        <Play size={15} />
        YouTube channel
      </div>
      {channel ? (
        <div className="sa-chan">
          {channel.thumbnail ? (
            <img className="sa-chan-pic" src={channel.thumbnail} alt="" width={32} height={32} />
          ) : (
            <span className="sa-chan-ic" aria-hidden="true">
              <PlatformIcon platform="yt" size={22} />
            </span>
          )}
          <div className="sa-chan-i">
            <div className="sa-chan-t">{channel.title}</div>
            <div className="sa-chan-s">
              {channel.handle}
              {channel.subs ? ` · ${channel.subs} subscribers` : ''}
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              className="sa-lk-x"
              aria-label="Unlink channel"
              disabled={busy}
              onClick={() => void unlink()}
            >
              <X />
            </button>
          )}
        </div>
      ) : (
        <div className="sa-chan-add">
          <span className="sa-chan-ic" aria-hidden="true">
            <PlatformIcon platform="yt" size={22} />
          </span>
          <input
            className="sa-inp flex"
            value={url}
            placeholder="youtube.com/@handle"
            aria-label="YouTube channel URL"
            disabled={!canEdit}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void pull()
            }}
          />
          <button
            type="button"
            className="sa-form-go inline"
            disabled={!canEdit || busy || !url.trim()}
            onClick={() => void pull()}
          >
            {busy ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
      )}
      <div className="sa-hint">
        Once the channel exists in this profile, paste its URL to pull the name, handle and
        subscriber count.
      </div>
    </div>
  )
}

// ── tags ───────────────────────────────────────────────────────────
// Loose chips + an "Add tag" popover, per the design — not the boxed
// multi-select the General tab uses.
const TONES = ['#E60001', '#C2820C', '#16A06A', '#2563EB', '#7C3AED', '#6B7280']

function TagsTile({
  form,
  setForm,
  canEdit,
  onToast
}: {
  form: FormState
  setForm: (f: FormState) => void
  canEdit: boolean
  onToast: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const { tags: wsTags, colorFor, createTag } = useWorkspaceTags(workspace?.workspace_id ?? null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [tone, setTone] = useState(TONES[5])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest?.('.sa-tg')) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  const ql = q.trim().toLowerCase()
  const available = wsTags
    .filter((t) => !form.tags.includes(t.name))
    .filter((t) => !ql || t.name.toLowerCase().includes(ql))
  const exact =
    wsTags.some((t) => t.name.toLowerCase() === ql) || form.tags.some((t) => t.toLowerCase() === ql)

  const add = (name: string): void => setForm({ ...form, tags: [...form.tags, name] })
  const remove = (name: string): void =>
    setForm({ ...form, tags: form.tags.filter((t) => t !== name) })

  const create = async (): Promise<void> => {
    const clean = q.trim().slice(0, 18)
    if (!clean) return
    try {
      await createTag(clean, tone)
      add(clean)
      setQ('')
      setOpen(false)
      onToast('info', `Tag “${clean}” created`)
    } catch (e) {
      onToast('error', (e as Error).message)
    }
  }

  return (
    <div className="sa-tile wide">
      <div className="sa-tk">
        <Tag size={15} />
        Tags
      </div>
      <div className="sm-tags">
        {form.tags.map((t) => (
          <span key={t} className="sm-tag">
            <Badge color={colorFor(t)}>{t}</Badge>
            {canEdit && (
              <button type="button" aria-label={`Remove ${t}`} onClick={() => remove(t)}>
                <X />
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <div className="sa-tg" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="sm-tag-add"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => {
                setQ('')
                setOpen((v) => !v)
              }}
            >
              <Plus />
              Add tag
            </button>
            {open && (
              <div className="sa-tg-pop" role="dialog" aria-label="Add tag">
                <div className="sa-px-search">
                  <Search />
                  <input
                    autoFocus
                    value={q}
                    placeholder="Search or create a tag…"
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && ql && !exact) void create()
                    }}
                  />
                </div>
                <div className="sa-tg-list">
                  {available.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      className="sa-tg-opt"
                      onClick={() => {
                        add(t.name)
                        setOpen(false)
                      }}
                    >
                      <Badge color={t.color}>{t.name}</Badge>
                    </button>
                  ))}
                  {!available.length && !ql && (
                    <div className="sa-px-empty">Every tag is already applied.</div>
                  )}
                </div>
                {ql && !exact && (
                  <button type="button" className="sa-tg-new" onClick={() => void create()}>
                    <Plus />
                    Create “{q.trim()}”
                    <span className="sa-tg-tones">
                      {TONES.map((c) => (
                        <span
                          key={c}
                          className={'sa-tg-tone' + (tone === c ? ' on' : '')}
                          style={{ color: c }}
                          title={c}
                          onClick={(e) => {
                            e.stopPropagation()
                            setTone(c)
                          }}
                        />
                      ))}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
