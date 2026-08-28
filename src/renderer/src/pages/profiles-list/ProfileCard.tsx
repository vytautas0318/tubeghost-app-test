import * as React from 'react'
import { Play } from 'lucide-react'
import { GhostAvatar } from '@/components/GhostAvatar'
import { RowMenu } from './RowMenu'
import { OsMark } from './osFlag'
import { InlineName } from './InlineName'
import { GroupCell } from './GroupCell'
import { ProxyCell } from './InlineCells'
import type { GroupRow } from '@/lib/groups'
import type { ViewProfile } from './types'
import type { ProxyRow } from '@/lib/proxies'
import type { ProfileRow as ProfileRowType } from '@/lib/profiles'
import { profileColor } from './profileColor'

/**
 * ProfileCard — the Simple view's tile. Shows only what a non-technical user
 * needs: a per-profile ghost mark, name, group, proxy + OS, a status line,
 * and one primary
 * Launch/Stop button.
 *
 * Ported from the desktop renderer so both apps present the same card. Two
 * desktop-only capabilities are deliberately absent here: launching a browser
 * and cross-device session sync both run through the local engine, which a web
 * page has no access to. The Launch slot instead carries the same
 * "open in the desktop app" prompt the table row uses.
 *
 * Name, group and proxy are inline-editable here, using the SAME components as
 * the table row (InlineName / GroupCell / ProxyCell) so the two views cannot
 * drift on edit semantics or permissions. Tags remain an Advanced affordance —
 * they need more room than a card gives.
 */
export function ProfileCard({
  profile: p,
  raw,
  proxyMeta,
  onChanged,
  selected,
  selectionActive,
  onSelectChange,
  workspaceId,
  onToast,
  onOpen,
  canLaunch,
  groups,
  canEdit
}: {
  profile: ViewProfile
  raw: ProfileRowType
  proxyMeta?: ProxyRow | null
  // Passing the updated row lets the page patch it in place; omitting it
  // forces a full reload (for changes touching more than this profile).
  onChanged: (updated?: ProfileRowType) => void
  selected: boolean
  // True once ANY card is selected: the grid is in selection mode, so a click
  // anywhere on a card toggles it instead of doing nothing.
  selectionActive: boolean
  // `range` is true when shift was held — extends from the list's anchor card.
  onSelectChange: (checked: boolean, range?: boolean) => void
  workspaceId: string
  onToast?: (kind: 'error' | 'info', text: string) => void
  // Web has no local engine: this raises the "desktop app required" modal.
  onOpen: () => void
  canLaunch: boolean
  // Group list for the inline group picker (same source the table row uses).
  groups: GroupRow[]
  canEdit: boolean
}): React.ReactElement {
  const [avatarFailed, setAvatarFailed] = React.useState(false)
  // The desktop app stores the linked channel as six flat columns; this app
  // stores one `youtube_channel` JSON blob (the two schemas both exist in the
  // shared database — see the migration note). Reading it into the same shape
  // here keeps the card's markup identical to the desktop's. `subs` is already
  // human-formatted ("412K") on this side, so no formatSubs() is needed.
  const channel = raw.youtube_channel ?? null
  // Shift state of the click that produced the pending change event.
  const shiftRef = React.useRef(false)
  const running = p.status === 'open'
  const heldByOther = !!p.openByOther
  const geo =
    proxyMeta?.country_code && proxyMeta.city
      ? `${proxyMeta.country_code} · ${proxyMeta.city}`
      : (proxyMeta?.country_code ?? null)

  return (
    // `group` is required by RowMenu: its ⋮ button is `opacity-0
    // group-hover:opacity-100`, so without a Tailwind group ancestor it never
    // becomes visible. The table row carries the same class for this reason.
    <div
      className={
        'group pc-card' +
        (running ? ' live' : '') +
        (selected ? ' sel' : '') +
        (selectionActive ? ' selectable' : '')
      }
      // Once something is selected, clicking the card body toggles it -- having
      // to hit the small corner checkbox every time is tedious when picking
      // several. Interactive children (Launch, the ⋮ menu, the checkbox,
      // inline editors, links) stop propagation or are excluded here, so this
      // only fires for clicks on dead space.
      onClick={
        selectionActive
          ? (e) => {
              const el = e.target as HTMLElement
              if (el.closest('button, a, input, select, textarea, [role="button"]')) return
              // A click that ends a text drag must not toggle: users still need
              // to select and copy an IP, a group name, a timestamp.
              if (!window.getSelection()?.isCollapsed) return
              onSelectChange(!selected, e.shiftKey)
            }
          : undefined
      }
    >
      <div className="pc-card-top">
        <input
          type="checkbox"
          className="pc-check"
          checked={selected}
          // See ProfileRow: modifier keys live on the click, not the change.
          onMouseDown={(e) => {
            if (e.shiftKey) e.preventDefault()
          }}
          onClick={(e) => {
            shiftRef.current = e.shiftKey
          }}
          onChange={(e) => {
            const range = shiftRef.current
            shiftRef.current = false
            onSelectChange(e.target.checked, range)
          }}
          aria-label={`Select ${p.name}`}
        />
        <RowMenu profile={raw} heldByOther={heldByOther} onChange={onChanged} />
      </div>

      {/* A linked channel's real avatar identifies the profile far better than
          a generated mascot. Google's thumbnail URLs can expire, so a failed
          load falls back to the ghost rather than showing a broken image. */}
      {channel?.thumbnail && !avatarFailed ? (
        <img
          className="pc-avatar"
          src={channel.thumbnail}
          alt=""
          onError={() => setAvatarFailed(true)}
        />
      ) : (
        <GhostAvatar color={profileColor(raw.id, raw.group_id)} size={64} radius={999} />
      )}

      <div className="pc-name">
        <InlineName
          id={raw.id}
          name={p.name}
          canEdit={canEdit}
          onChanged={onChanged}
          onToast={onToast}
        />
      </div>
      {/* Channel line replaces the group line when a channel is linked: the
          handle + sub count is what the user actually recognises. */}
      {channel ? (
        <div className="pc-chan" title={channel.title || undefined}>
          {[channel.handle || channel.title, channel.subs ? `${channel.subs} subs` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      ) : (
        <div className="pc-grp">
          <GroupCell
            raw={raw}
            groups={groups}
            canEdit={canEdit}
            onChanged={onChanged}
            alwaysShowEmpty
          />
        </div>
      )}

      <div className="pc-chips">
        <span className="pc-chip">
          <OsMark platform={raw.platform} />
        </span>
        <span className="pc-chip pc-chip-px">
          <ProxyCell
            raw={raw}
            meta={proxyMeta}
            workspaceId={workspaceId}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        </span>
      </div>
      {geo && <div className="pc-geo">{geo}</div>}

      <div className={'pc-status' + (running ? ' on' : '')}>
        {heldByOther
          ? `In use · ${p.openByOther?.device ?? 'another device'}`
          : running
            ? 'Running now'
            : `Last opened ${p.lastOpened}`}
      </div>

      <div className="pc-launch">
        <button
          onClick={onOpen}
          disabled={!canLaunch}
          className="row-open"
          title={canLaunch ? `Launch ${p.name}` : "You don't have permission to launch profiles"}
        >
          <Play className="w-3 h-3" fill="currentColor" />
          Launch
        </button>
      </div>
    </div>
  )
}
