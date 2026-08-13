// "Link channel" popover on a profile card — paste a YouTube channel URL or
// @handle, pull its title / handle / subscriber count, store it on the
// profile. Ported from the design system's ArcadeCard link flow
// (ui_kits/browser/ProfileCards.jsx).
//
// Anchored in VIEWPORT space and clamped, not positioned relative to the
// card: the grid's last column would otherwise push the popover off-screen,
// and the card itself is a transformed, overflow-clipped box.

import * as React from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { hasYouTubeApiKey, lookupChannel, type LinkedChannel } from '@/lib/youtube'
import type { Anchor } from './cardViewState'

export function LinkChannelPopover({
  anchor,
  onClose,
  onLink
}: {
  anchor: Anchor
  onClose: () => void
  // Resolves once the channel is persisted. Rejecting keeps the popover
  // open with the message shown, so the user can correct the URL.
  onLink: (channel: LinkedChannel) => Promise<void>
}): React.ReactElement {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // Scroll/resize invalidate the anchor, so dismiss rather than let the
    // popover drift away from the card it belongs to.
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const pull = async (): Promise<void> => {
    if (busy || !url.trim()) return
    setBusy(true)
    setErr(null)
    try {
      await onLink(await lookupChannel(url))
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="ar-linkpop"
      role="dialog"
      aria-label="Link a YouTube channel"
      style={{ left: anchor.x + 'px', top: anchor.y + 'px' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ar-linkpop-k">Channel URL or handle</div>
      <div className="ar-linkpop-row">
        <input
          autoFocus
          value={url}
          placeholder="youtube.com/@handle"
          aria-label="YouTube channel URL or handle"
          onChange={(e) => {
            setUrl(e.target.value)
            setErr(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void pull()
          }}
        />
        <button
          type="button"
          className="ar-linkpop-go"
          disabled={busy || !url.trim()}
          onClick={() => void pull()}
        >
          {busy ? '…' : 'Link'}
        </button>
      </div>
      <div className={'ar-linkpop-h' + (err ? ' err' : '')}>
        {err ??
          (hasYouTubeApiKey()
            ? 'Pulls the name, handle and subscriber count.'
            : 'Links the handle. Set VITE_YOUTUBE_API_KEY to also pull the name and subscriber count.')}
      </div>
    </div>,
    document.body
  )
}
