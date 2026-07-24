import * as React from 'react'
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Sun, Moon, Bell, HelpCircle } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { useTheme } from '@/store/theme'
import { SegmentedControl } from '@/components/ui'
import { GhostAvatar } from '@/components/GhostAvatar'
import { AvatarPicker } from '@/components/AvatarPicker'
import { readAvatarConfig, saveAvatarConfig, type AvatarConfig } from '@/lib/avatar'
import { AccountMenu } from './AccountMenu'
import { PlanCard } from './PlanCard'

/**
 * SidebarUser — the always-dark rail's bottom block: plan card, theme switch,
 * and the user chip. The chip opens the AccountMenu popover (account header +
 * workspace switcher + links). Avatar customization is orchestrated here
 * because the picker is portalled and anchored to the popover.
 */
export function SidebarUser(): React.ReactElement {
  const { user } = useAuth()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.set)

  const [open, setOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  // Session-sticky: once the picker has been shown and NOT dismissed via "Done",
  // re-opening the account popover re-shows the picker too. Cleared only by
  // "Done". Resets on app restart (in-memory only).
  const [avatarSticky, setAvatarSticky] = useState(false)
  // Optimistic local override so the picker previews instantly; null = use the
  // persisted config from user metadata (the source of truth after save).
  const [draftAvatar, setDraftAvatar] = useState<AvatarConfig | null>(null)
  // Screen-space anchor for the portalled picker (see below).
  const [avatarAnchor, setAvatarAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  // The account popover card — the picker anchors to its right edge so it clears
  // the menu entirely instead of overlapping it.
  const popRef = useRef<HTMLDivElement>(null)
  // The portalled picker lives outside `ref`, so the outside-click handler
  // must also treat clicks inside it as "inside".
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent): void {
      const t = e.target as Node
      const insideMain = ref.current?.contains(t)
      const insidePicker = pickerRef.current?.contains(t)
      if (!insideMain && !insidePicker) {
        setOpen(false)
        setAvatarOpen(false)
        // Clicking away closes the popover. If the picker isn't sticky (i.e. it
        // won't reappear on the next open), drop the unsaved draft so the avatar
        // reverts to the last saved value.
        if (!avatarSticky) setDraftAvatar(null)
      }
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, avatarSticky])

  // Anchor the fixed-position picker to the RIGHT edge of the whole account
  // popover, bottom-aligned with it — so it sits beside the menu (like a
  // submenu) instead of overlapping it. Portalled to body so the sidebar's
  // overflow:hidden can't clip it. Returns false if the popover isn't laid out.
  const anchorPicker = (): boolean => {
    const r = popRef.current?.getBoundingClientRect()
    if (!r) return false
    setAvatarAnchor({ left: r.right + 12, bottom: window.innerHeight - r.bottom })
    return true
  }

  // When the popover (re)opens while the picker is sticky (shown but not "Done"),
  // re-show the picker and re-anchor it. Runs in a layout effect so the anchor is
  // measured after the popover paints.
  useLayoutEffect(() => {
    if (open && avatarSticky) {
      if (anchorPicker()) setAvatarOpen(true)
    }
  }, [open, avatarSticky])

  const displayName = user?.email?.split('@')[0] ?? 'Signed in'
  // The user's composable ghost avatar. Draft (while the picker is open) wins
  // for instant preview; otherwise read the persisted config from metadata.
  const avatar = draftAvatar ?? readAvatarConfig(user)

  // Picking only updates the local draft (live preview). Nothing is persisted
  // until "Done" — so closing without Done discards the change.
  const changeAvatar = (next: AvatarConfig): void => {
    setDraftAvatar(next)
  }

  // "Done": commit the current draft to user metadata (auth store refreshes on
  // the USER_UPDATED event, which becomes the new source of truth). Clearing the
  // draft would briefly flash the old avatar until that event lands, so keep it.
  const commitAvatar = (): void => {
    if (draftAvatar) void saveAvatarConfig(draftAvatar).catch(() => undefined)
  }

  // Avatar tile: the composable ghost, shared by the sidebar row and the
  // account-popover header (different sizes).
  const avatarTile = (px: number, radius: number): React.ReactElement => (
    <GhostAvatar
      size={px}
      radius={radius}
      color={avatar.color}
      face={avatar.face}
      glasses={avatar.glasses}
      hat={avatar.hat}
      hand={avatar.hand}
    />
  )

  const onEditAvatar = (e: React.MouseEvent): void => {
    e.stopPropagation()
    anchorPicker()
    setAvatarOpen((v) => {
      const next = !v
      // Opening arms the session-sticky flag; toggling closed here (without
      // "Done") disarms it and drops the unsaved draft.
      setAvatarSticky(next)
      if (!next) setDraftAvatar(null)
      return next
    })
  }

  return (
    <div className="sb-bottom">
      <PlanCard />

      <div className="sb-util">
        <div className="sb-util-btn" title="Notifications">
          <Bell size={16} />
          <span className="sb-util-dot" />
        </div>
        <div className="sb-util-btn" title="Help & support">
          <HelpCircle size={16} />
        </div>
        <div className="sb-util-sp" />
        <SegmentedControl
          value={theme}
          onChange={(v) => setTheme(v as 'light' | 'dark')}
          style={{
            padding: '2px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--sb-line)'
          }}
          options={[
            { value: 'light', icon: <Sun size={14} /> },
            { value: 'dark', icon: <Moon size={14} /> }
          ]}
        />
      </div>

      <div className="sb-user-wrap" ref={ref}>
        <div className={'sb-user' + (open ? ' on' : '')} onClick={() => setOpen((v) => !v)}>
          {avatarTile(32, 9)}
          <div className="sb-user-info">
            <div className="sb-user-name">{displayName}</div>
            <div className="sb-user-mail">{user?.email}</div>
          </div>
          <div
            className="sb-util-btn"
            title="Account"
            style={{
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s var(--ease)'
            }}
          >
            <ChevronDown size={16} />
          </div>
        </div>

        {open && (
          <AccountMenu
            displayName={displayName}
            avatarTile={avatarTile}
            onEditAvatar={onEditAvatar}
            onClose={() => setOpen(false)}
            popRef={popRef}
          />
        )}
      </div>

      {/* Portalled to <body> so the sidebar's `overflow: hidden` (which clips
          anything past its right edge) can't hide the picker. Fixed-positioned
          from the edit button's on-screen rect. */}
      {open &&
        avatarOpen &&
        avatarAnchor &&
        createPortal(
          <div
            ref={pickerRef}
            style={{
              position: 'fixed',
              left: avatarAnchor.left,
              bottom: avatarAnchor.bottom,
              zIndex: 1000
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <AvatarPicker
              config={avatar}
              onChange={changeAvatar}
              onDone={() => {
                commitAvatar()
                setAvatarOpen(false)
                setAvatarSticky(false)
              }}
              floating
            />
          </div>,
          document.body
        )}
    </div>
  )
}
