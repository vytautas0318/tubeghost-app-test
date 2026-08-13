// The editor's Simple mode: one screen instead of four tabs. Port of the
// design system's ProfileEditor.jsx `mode === 'simple'` branch (cards.css
// `.sa-*`) — hero, plain-words guide, then tiles for Proxy, Device,
// Fingerprint, YouTube channel, Linked credentials and Tags.
//
// SAVE MODEL, which differs from the tabs on purpose:
//   * Text fields (name, group, tags) live in the shared `form` and commit
//     with the header's "Save changes", exactly as the General tab does.
//   * Structural picks — proxy, OS, fingerprint, channel — apply
//     IMMEDIATELY, because each is a single deliberate choice with a
//     server round-trip of its own (assignProxyToProfile, a coherent
//     fingerprint regeneration). This mirrors what the Proxy tab already
//     does on pool-pick, and each tile says so.

import * as React from 'react'
import { useState } from 'react'
import {
  ChevronDown,
  Fingerprint,
  HelpCircle,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  X
} from 'lucide-react'
import { PlatformIcon } from '@/components/ui'
import { GhostAvatar } from '@/components/GhostAvatar'
import { NavIcon } from '@/components/sidebar/navIcons'
import { useWorkspace } from '@/store/workspace'
import {
  assignProxyToProfile,
  clearProfileProxy,
  updateProfile,
  type ProfileRow
} from '@/lib/profiles'
import type { LinkedChannel } from '@/lib/youtube'
import { groupColor, profileFace } from '@/pages/profiles-list/cardVisuals'
import { LinkChannelPopover } from '@/pages/profiles-list/LinkChannelPopover'
import { anchorTo, type Anchor } from '@/pages/profiles-list/cardViewState'
import { GroupSelect } from './GroupSelect'
import { TagsField } from './TagsField'
import { ProxyPicker } from './ProxyPicker'
import { LinkedCredentials } from './LinkedCredentials'
import { newFingerprintPatch, optimizedPatch, osLabel } from './simpleFingerprint'
import { GUIDE_STEPS, readGuideSeen, storeGuideSeen } from './simpleEditorState'
import type { FormState } from './types'

export function SimpleEditor({
  profile,
  form,
  setForm,
  canEdit,
  groupName,
  onProfileSaved,
  onToast,
  onGoAdvanced,
  onNavigate
}: {
  profile: ProfileRow
  form: FormState
  setForm: (f: FormState) => void
  canEdit: boolean
  // Resolved group name, for the avatar's accent colour.
  groupName: string
  onProfileSaved: (p: ProfileRow) => void
  onToast: (kind: 'error' | 'info', text: string) => void
  onGoAdvanced: () => void
  onNavigate: (to: string) => void
}): React.ReactElement {
  const workspace = useWorkspace((s) => s.current)
  const [guide, setGuide] = useState(() => !readGuideSeen())
  const [busy, setBusy] = useState<null | 'proxy' | 'fp' | 'os' | 'opt'>(null)
  const [proxyOpen, setProxyOpen] = useState(false)
  const [linkAnchor, setLinkAnchor] = useState<Anchor | null>(null)

  const dismissGuide = (): void => {
    setGuide(false)
    storeGuideSeen()
  }

  const channel = profile.youtube_channel ?? null
  const proxyLabel = profile.proxy_host ? `${profile.proxy_host}:${profile.proxy_port}` : null

  // One writer for every immediate-apply tile, so they share error
  // handling and the "which tile is busy" state.
  const apply = async (
    kind: 'proxy' | 'fp' | 'os' | 'opt',
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

  const currentOs = osLabel(profile.platform)

  const switchOs = (next: 'Windows' | 'macOS'): void => {
    if (next === currentOs) return
    // Not a bare `platform` write — see newFingerprintPatch. The whole
    // device is regenerated so user-agent, GPU, CPU/RAM and resolution
    // stay consistent with the new OS.
    if (
      !confirm(
        `Switch this profile to ${next}?\n\nIts device details (user agent, GPU, CPU, screen) are regenerated to match — a ${currentOs} device can't keep its identity on ${next} without looking fake.`
      )
    )
      return
    void apply(
      'os',
      newFingerprintPatch(next === 'macOS' ? 'macos' : 'windows', profile.brand_version),
      `Switched to ${next} with a matching device`
    )
  }

  const newFingerprint = (): void => {
    if (
      !confirm(
        'Generate a new fingerprint?\n\nThis profile will look like a different device on its next launch. Sites that already know the old one may ask it to verify again.'
      )
    )
      return
    void apply(
      'fp',
      newFingerprintPatch(profile.platform, profile.brand_version),
      'New fingerprint generated'
    )
  }

  const linkChannel = async (ch: LinkedChannel): Promise<void> => {
    onProfileSaved(await updateProfile(profile.id, { youtube_channel: ch }))
    onToast('info', `${ch.title} linked`)
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
          <div className="sa-grp-wrap">
            <GroupSelect
              workspaceId={workspace?.workspace_id ?? null}
              value={form.group_id ?? null}
              onChange={(groupId) => setForm({ ...form, group_id: groupId })}
            />
          </div>
          {profile.profile_number != null && (
            <>
              <span className="sa-sep">·</span>
              <span className="sa-code">{profile.profile_number}</span>
            </>
          )}
        </div>
      </div>

      {/* ── plain-words guide ────────────────────────────────────── */}
      {guide && (
        <div className="sa-guide" id="sa-guide-panel">
          <div className="sa-guide-top">
            <div className="sa-guide-t">
              <HelpCircle size={15} />
              How this works, in plain words
            </div>
            <button type="button" className="sa-guide-x" onClick={dismissGuide}>
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

      <div className="sa-grid">
        {/* ── proxy ──────────────────────────────────────────────── */}
        <div className="sa-tile">
          <div className="sa-tk">
            <NavIcon name="proxies" size={15} />
            Proxy
          </div>
          <button
            type="button"
            className="sa-sel"
            aria-haspopup="listbox"
            aria-expanded={proxyOpen}
            disabled={!canEdit || busy === 'proxy'}
            onClick={() => setProxyOpen((v) => !v)}
          >
            <span className={proxyLabel ? 'mono' : 'none'}>
              {proxyLabel ?? 'No proxy assigned'}
            </span>
            {busy === 'proxy' ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
          {proxyOpen && (
            <div className="sa-px-inline">
              <ProxyPicker
                currentProxyHost={profile.proxy_host}
                currentProxyPort={profile.proxy_port}
                disabled={!canEdit || busy === 'proxy'}
                onPick={(p) => {
                  // Goes through assignProxyToProfile, not a hand-written
                  // patch — it owns how a pool proxy is denormalised onto
                  // the row, and the launcher reads those columns.
                  setProxyOpen(false)
                  if (!canEdit || busy) return
                  setBusy('proxy')
                  assignProxyToProfile(profile.id, {
                    id: p.id,
                    proxy_type: p.proxy_type,
                    host: p.host,
                    port: p.port,
                    username: p.username,
                    password_encrypted: p.password_encrypted,
                    source: p.source,
                    tubeproxies_ip_id: p.tubeproxies_ip_id
                  })
                    .then((row) => {
                      onProfileSaved(row)
                      onToast('info', `Proxy set to ${p.host}:${p.port}`)
                    })
                    .catch((e: Error) => onToast('error', e.message))
                    .finally(() => setBusy(null))
                }}
              />
              {proxyLabel && (
                <button
                  type="button"
                  className="sa-px-clear"
                  onClick={() => {
                    if (!confirm('Remove the proxy from this profile?')) return
                    setProxyOpen(false)
                    setBusy('proxy')
                    clearProfileProxy(profile.id)
                      .then((p) => {
                        onProfileSaved(p)
                        onToast('info', 'Proxy removed')
                      })
                      .catch((e: Error) => onToast('error', e.message))
                      .finally(() => setBusy(null))
                  }}
                >
                  <Trash2 size={13} />
                  Remove proxy
                </button>
              )}
            </div>
          )}
          <div className="sa-hint">
            {proxyLabel
              ? 'Timezone, language and location follow this IP.'
              : 'Without one, this profile goes out on your own connection — which is what links channels together.'}
          </div>
        </div>

        {/* ── device ─────────────────────────────────────────────── */}
        <div className="sa-tile">
          <div className="sa-tk">
            <Monitor size={15} />
            Device
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
                {o}
              </button>
            ))}
          </div>
          <div className="sa-hint">
            {busy === 'os'
              ? 'Regenerating the device…'
              : 'Every signal is generated to match this device. Switching regenerates them.'}
          </div>
        </div>

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
              onClick={newFingerprint}
            >
              <RefreshCw size={12} className={busy === 'fp' ? 'animate-spin' : undefined} />
              New
            </button>
          </div>
          <label className="sa-switch">
            <input
              type="checkbox"
              checked={profile.google_optimized === true}
              disabled={!canEdit || busy === 'opt'}
              onChange={(e) =>
                void apply(
                  'opt',
                  optimizedPatch(e.target.checked),
                  e.target.checked ? 'Optimized for YouTube' : 'Optimization flag cleared'
                )
              }
            />
            <span>Optimized for YouTube</span>
          </label>
          <div className="sa-hint">Tuned to the signals YouTube reads.</div>
        </div>

        {/* ── youtube channel ────────────────────────────────────── */}
        <div className="sa-tile wide">
          <div className="sa-tk">
            <PlatformIcon platform="yt" size={18} />
            YouTube channel
          </div>
          {channel ? (
            <div className="sa-chan">
              {channel.thumbnail ? (
                <img
                  className="sa-chan-pic"
                  src={channel.thumbnail}
                  alt=""
                  width={32}
                  height={32}
                />
              ) : (
                <span className="sa-chan-ic" aria-hidden="true">
                  <PlatformIcon platform="yt" size={26} />
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
                  onClick={() => {
                    void apply('fp', { youtube_channel: null }, 'Channel unlinked')
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ) : canEdit ? (
            <button
              type="button"
              className="sa-link-btn"
              aria-haspopup="dialog"
              aria-expanded={!!linkAnchor}
              onClick={(e) => setLinkAnchor(linkAnchor ? null : anchorTo(e.currentTarget))}
            >
              <Plus size={13} />
              Link a channel
            </button>
          ) : (
            <div className="sa-none">No channel linked.</div>
          )}
          <div className="sa-hint">
            Paste the channel URL to pull its name, handle and subscriber count.
          </div>
        </div>

        {/* ── linked credentials ─────────────────────────────────── */}
        <div className="sa-tile wide">
          <LinkedCredentials
            proxyHost={proxyLabel}
            onManageProxy={() => setProxyOpen(true)}
            onManageAuth={() => onNavigate('/authenticator')}
            onManagePhone={() => onNavigate('/phone-numbers')}
          />
        </div>

        {/* ── tags ───────────────────────────────────────────────── */}
        <div className="sa-tile wide">
          <div className="sa-tk">
            <Tag size={15} />
            Tags
          </div>
          <TagsField
            workspaceId={workspace?.workspace_id ?? null}
            tags={form.tags}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
        </div>
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

      {linkAnchor && (
        <LinkChannelPopover
          anchor={linkAnchor}
          onClose={() => setLinkAnchor(null)}
          onLink={linkChannel}
        />
      )}
    </div>
  )
}
