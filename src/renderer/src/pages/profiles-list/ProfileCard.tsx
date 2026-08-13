// One profile as a card in the Simple view. A direct port of the design
// system's ArcadeCard (ui_kits/browser/ProfileCards.jsx + cards.css `.ar`):
// avatar, name, channel line, OS + proxy chips, last-opened, a full-width
// Launch button, and the row menu revealed on hover.
//
// It deliberately carries LESS than the table row — no group, no tags, no
// selection, no inline editing. Those live in the Advanced view; this one is
// for picking a profile and launching it.

import * as React from 'react'
import { useState } from 'react'
import { Play, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GhostAvatar } from '@/components/GhostAvatar'
import { OsMark } from './osFlag'
import { RowMenu } from './RowMenu'
import { groupColor, profileFace } from './cardVisuals'
import { LinkChannelPopover } from './LinkChannelPopover'
import { anchorTo, type Anchor } from './cardViewState'
import type { ViewProfile } from './types'
import { updateProfile, type ProfileRow as ProfileRowType } from '@/lib/profiles'
import type { LinkedChannel } from '@/lib/youtube'

export function ProfileCard({
  profile: p,
  raw,
  onChanged,
  canEdit,
  onToast,
  onOpen,
  canLaunch
}: {
  profile: ViewProfile
  raw: ProfileRowType
  onChanged: (updated?: ProfileRowType) => void
  canEdit: boolean
  onToast?: (kind: 'error' | 'info', text: string) => void
  onOpen: () => void
  canLaunch: boolean
}): React.ReactElement {
  const navigate = useNavigate()
  const [linkAnchor, setLinkAnchor] = useState<Anchor | null>(null)

  const channel = raw.youtube_channel ?? null
  const running = p.status === 'open'
  const inUse = !!p.openByOther && !running
  const proxy = p.proxyIp ? p.proxyIp : 'No proxy'

  const linkChannel = async (ch: LinkedChannel): Promise<void> => {
    const updated = await updateProfile(raw.id, { youtube_channel: ch })
    onChanged(updated)
    onToast?.('info', `${ch.title} linked to ${p.name}`)
  }

  return (
    <div className={'ar group' + (running ? ' live' : '') + (inUse ? ' inuse' : '')}>
      <div className="ar-menu">
        <RowMenu profile={raw} heldByOther={!!p.openByOther} onChange={onChanged} />
      </div>

      <span className="ar-halo">
        {channel?.thumbnail ? (
          <img className="pc-pic" src={channel.thumbnail} alt="" width={64} height={64} />
        ) : (
          <GhostAvatar
            size={64}
            radius={999}
            color={groupColor(p.group, p.id)}
            face={profileFace(p.id)}
            glasses="round"
          />
        )}
        {inUse && (
          <span className="ar-user" title={`In use by ${p.openByOther?.initials}`}>
            {p.openByOther?.initials}
          </span>
        )}
      </span>

      <button
        type="button"
        className="ar-name"
        title={p.name}
        onClick={() => navigate(`/profiles/${raw.id}`)}
      >
        {p.name}
      </button>

      {channel ? (
        <div className="ar-chan" title={channel.title}>
          {channel.handle}
          {channel.subs ? (
            <>
              <span>·</span>
              {channel.subs} subs
            </>
          ) : null}
        </div>
      ) : canEdit ? (
        <button
          type="button"
          className="ar-chan link"
          aria-haspopup="dialog"
          aria-expanded={!!linkAnchor}
          onClick={(e) => setLinkAnchor(linkAnchor ? null : anchorTo(e.currentTarget))}
        >
          <Plus />
          Link channel
        </button>
      ) : (
        // Keeps every card the same height whether or not a channel is
        // linked — an empty row here, not a collapsed one.
        <div className="ar-chan" />
      )}

      <div className="ar-chips">
        <span className="ar-chip" title={raw.platform}>
          <OsMark platform={raw.platform} className="w-[11px] h-[11px] shrink-0" />
          {(raw.platform ?? '').toLowerCase().includes('mac') ? 'macOS' : 'Win'}
        </span>
        <span className={'ar-chip' + (p.proxyIp ? '' : ' none')} title={proxy}>
          {proxy}
        </span>
      </div>

      {inUse ? (
        <div className="ar-seen inuse-note">Open by {p.openByOther?.initials}</div>
      ) : (
        <div className="ar-seen">{p.lastOpened}</div>
      )}

      <button
        type="button"
        className="pc-btn wide"
        onClick={onOpen}
        disabled={!canLaunch || inUse}
        title={
          inUse
            ? `In use by ${p.openByOther?.initials}`
            : canLaunch
              ? `Launch ${p.name}`
              : "You don't have permission to launch profiles"
        }
      >
        <Play fill="currentColor" />
        {inUse ? 'In use' : 'Launch'}
      </button>

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
