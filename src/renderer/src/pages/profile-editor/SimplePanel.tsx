// The Simple editor, built against the design export's `.sa-*` layout:
// identity hero → card trio (Proxy / Device & engine / Fingerprint) → linked
// credentials → tags → footer.
//
// NON-DESTRUCTIVE: state lives in useSimpleDraft, which writes back only the
// fields the user actually operated. Opening a profile and saving without
// touching anything produces an empty patch. Values Simple doesn't expose
// (canvas/audio/font noise, locale, timezone, launch args) are never in the
// write set at all.

import * as React from 'react'
import { Globe, Info, Shield } from 'lucide-react'
import { assignProxyToProfile, clearProfileProxy, type ProfileRow } from '@/lib/profiles'
import type { ProxyRow } from '@/lib/proxies'
import { GhostAvatar } from '@/components/GhostAvatar'
import { profileColor } from '@/pages/profiles-list/profileColor'
import { GroupSelect } from './GroupSelect'
import { TagsField } from './TagsField'
import { SimpleCredentials } from './SimpleCredentials'
import { SimpleProxySelect } from './SimpleProxySelect'
import { DeviceTile, FingerprintTile } from './SimpleFields'
import { hasCustomAdvanced } from './hasCustomAdvanced'
import { AskBar } from './AskBar'
import { SimpleGuide } from './SimpleGuide'
import { SimpleChannelCard } from './SimpleChannelCard'
import { useWorkspaceTags } from '@/lib/useWorkspaceTags'
import type { UseSimpleDraft } from './useSimpleDraft'

export function SimplePanel({
  profile,
  simple,
  workspaceId,
  canEdit,
  onToast,
  onOpenAdvanced,
  onOrderNumber,
  onProfileSaved,
  pendingProxy,
  onPendingProxyChange,
  guideOpen,
  onDismissGuide
}: {
  profile: ProfileRow | null
  simple: UseSimpleDraft
  workspaceId: string | null
  canEdit: boolean
  onToast?: (kind: 'error' | 'info', text: string) => void
  onOpenAdvanced: () => void
  onOrderNumber: () => void
  // Create screen only: the proxy the user picked before the row exists.
  pendingProxy?: ProxyRow | null
  onPendingProxyChange?: (p: ProxyRow | null) => void
  guideOpen: boolean
  onDismissGuide: () => void
  onProfileSaved: (p: ProfileRow) => void
}): React.ReactElement {
  const { draft, patch } = simple
  const disabled = !canEdit
  const custom = hasCustomAdvanced(profile)
  // Workspace tag registry — lets the Ask bar recognise tag names by word.
  const { tags: wsTags } = useWorkspaceTags(workspaceId)
  // A linked channel's real avatar identifies the profile better than the
  // generated mascot — same rule the Profiles grid follows. Google's thumbnail
  // URLs can expire, so a failed load falls back to the ghost. Keyed reset on
  // the URL so linking/refreshing a channel retries the new image.
  // This app stores the linked channel as one `youtube_channel` JSON blob
  // rather than the desktop's flat columns — see SimpleChannelCard.
  const channelAvatar = profile?.youtube_channel?.thumbnail ?? null
  const [avatarFailed, setAvatarFailed] = React.useState(false)
  React.useEffect(() => setAvatarFailed(false), [channelAvatar])

  // Proxy assignment goes through the SAME data-layer call Advanced uses
  // (assignProxyToProfile / detachProxyFromProfile) rather than patching proxy
  // columns directly — it owns encrypted credentials, the TubeProxies link and
  // the source field, none of which belong in a form draft.
  const [proxyBusy, setProxyBusy] = React.useState(false)
  const pickProxy = async (p: ProxyRow): Promise<void> => {
    // No row yet (create screen): stage the choice. assignProxyToProfile needs
    // a profile id, so useEditorSave attaches this immediately after insert.
    if (!profile) {
      onPendingProxyChange?.(p)
      return
    }
    setProxyBusy(true)
    try {
      const updated = await assignProxyToProfile(profile.id, {
        id: p.id,
        proxy_type: p.proxy_type,
        host: p.host,
        port: p.port,
        username: p.username,
        password_encrypted: p.password_encrypted,
        source: p.source,
        tubeproxies_ip_id: p.tubeproxies_ip_id
      })
      onProfileSaved(updated)
    } catch (e) {
      onToast?.('error', `Could not assign proxy: ${(e as Error).message}`)
    } finally {
      setProxyBusy(false)
    }
  }

  // `ask` skips the confirm: the Ask bar already shows what it changed and
  // offers Undo, so a second modal on top of that is noise. The explicit
  // "Remove proxy" button still confirms, as Advanced does.
  const clearProxy = async (opts?: { ask?: boolean }): Promise<void> => {
    // Staged pick on the create screen — drop it without a confirm, since
    // nothing has been written anywhere yet.
    if (!profile) {
      onPendingProxyChange?.(null)
      return
    }
    if (!opts?.ask && !confirm('Remove the proxy from this profile?')) return
    setProxyBusy(true)
    try {
      onProfileSaved(await clearProfileProxy(profile.id))
    } catch (e) {
      onToast?.('error', `Could not remove proxy: ${(e as Error).message}`)
    } finally {
      setProxyBusy(false)
    }
  }

  return (
    <div className="sa">
      {/* Identity hero — avatar, name, group + profile number. The name is an
          always-editable input styled as a heading, matching the export. */}
      <div className="sa-hero">
        <span className="sa-face">
          {channelAvatar && !avatarFailed ? (
            <img
              className="sa-face-img"
              src={channelAvatar}
              alt=""
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <GhostAvatar
              size={72}
              radius={999}
              color={profileColor(profile?.id ?? 'new', draft.group_id)}
            />
          )}
        </span>
        <input
          className="sa-name"
          value={draft.name}
          aria-label="Profile name"
          placeholder="Untitled profile"
          disabled={disabled}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <div className="sa-id">
          <GroupSelect
            workspaceId={workspaceId}
            value={draft.group_id}
            onChange={(groupId) => patch({ group_id: groupId })}
            variant="inline"
            searchable
          />
          {profile?.profile_number != null && (
            <>
              <span>·</span>
              <span className="sa-code">{profile.profile_number}</span>
            </>
          )}
        </div>
      </div>

      {guideOpen && <SimpleGuide onDismiss={onDismissGuide} />}

      <AskBar
        draft={draft}
        patch={patch}
        workspaceId={workspaceId}
        // Include a staged pick so "use the Dallas IP" can tell that a proxy is
        // already chosen on an unsaved profile, and "no proxy" can clear it.
        currentProxyHost={profile?.proxy_host ?? pendingProxy?.host ?? null}
        knownTags={wsTags.map((t) => t.name)}
        // Enabled before the row exists: every Ask action patches the draft, and
        // the two that don't (pick/clear proxy) stage themselves on the create
        // screen exactly like the proxy tile does.
        disabled={disabled}
        onPickProxy={(p) => void pickProxy(p)}
        onClearProxy={() => void clearProxy({ ask: true })}
        onToast={onToast}
      />

      <div className="sa-grid">
        {/* Proxy — compact select. The workspace-pool list, its filter chips
            and the custom-inline tab stay in Advanced; this reads the same
            source so every proxy remains reachable. */}
        <div className="sa-tile">
          <div className="sa-tk">
            <Globe />
            Proxy
          </div>
          <SimpleProxySelect
            currentHost={profile?.proxy_host ?? pendingProxy?.host ?? null}
            currentPort={profile?.proxy_port ?? pendingProxy?.port ?? null}
            disabled={disabled || proxyBusy}
            onPick={(p) => void pickProxy(p)}
            onClear={() => void clearProxy()}
          />
          <div className="sa-hint">
            {profile?.proxy_host
              ? 'Timezone, language and location follow this IP.'
              : pendingProxy
                ? 'Attached when you save this profile.'
                : 'Assign a proxy so timezone, language and location have an IP to follow.'}
          </div>
        </div>

        <DeviceTile draft={draft} patch={patch} disabled={disabled} />
        <FingerprintTile draft={draft} patch={patch} disabled={disabled} onToast={onToast} />

        <SimpleChannelCard
          profile={profile}
          disabled={disabled}
          onProfileSaved={onProfileSaved}
          onRename={(name) => patch({ name })}
          onToast={onToast}
        />

        {/* Linked credentials — group + the existing authenticator / phone
            features. Nothing new is built here. */}
        <div className="sa-tile wide">
          <div className="sa-tk">
            <Shield />
            Linked credentials
          </div>
          <SimpleCredentials
            profileId={profile?.id ?? null}
            workspaceId={workspaceId}
            groupId={draft.group_id}
            onGroupChange={(groupId) => patch({ group_id: groupId })}
            onToast={onToast}
            onOrderNumber={onOrderNumber}
          />
          <div className="sa-hint">
            Pulled on launch — the profile verifies and receives codes without leaving the browser.
          </div>
        </div>

        <div className="sa-tile wide">
          <div className="sa-tk">Tags</div>
          <TagsField
            workspaceId={workspaceId}
            tags={draft.tags}
            onChange={(p) => patch({ tags: p.tags ?? draft.tags })}
          />
        </div>
      </div>

      {custom && (
        <div className="simple-note">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            This profile has custom advanced settings. They&rsquo;re preserved. Switch to Advanced
            to edit them.
          </span>
        </div>
      )}

      <div className="sa-foot">
        <div className="sa-hint">
          WebGL, canvas, audio, fonts and 20+ other signals are generated from the seed
          automatically. Open{' '}
          <button type="button" className="sm-link" onClick={onOpenAdvanced}>
            Advanced
          </button>{' '}
          to override any of them.
        </div>
      </div>
    </div>
  )
}
