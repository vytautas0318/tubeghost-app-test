// YOUTUBE CHANNEL — link a profile to the channel it runs.
//
// Paste a URL / @handle / channel id, press Fetch, and the channel's name,
// handle, avatar and subscriber count are pulled from the YouTube Data API and
// cached on the profile row. Those values are what the Profiles grid shows, so
// a user with 30 channels can tell their profiles apart at a glance.
//
// The count is a SNAPSHOT, not live — refetching on every render would burn a
// shared daily quota and slow the page. "Refresh" re-reads on demand.

import * as React from 'react'
import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { PlatformIcon } from '@tubeghost/ui'
import { lookupChannel } from '@/lib/youtube'
import { updateProfile } from '@/lib/profiles'
import type { ProfileRow } from '@/lib/profiles'

export function SimpleChannelCard({
  profile,
  disabled,
  onProfileSaved,
  onRename,
  onToast
}: {
  profile: ProfileRow | null
  disabled: boolean
  onProfileSaved: (p: ProfileRow) => void
  // Applies the channel title as the profile name. Goes through the editor's
  // draft (not a direct write) so it participates in the normal save flow.
  onRename: (name: string) => void
  onToast?: (kind: 'error' | 'info', text: string) => void
}): React.ReactElement {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  // A Google-hosted avatar URL can expire; fall back to the platform icon
  // rather than showing a broken image.
  const [imgFailed, setImgFailed] = useState(false)
  // Offered after linking when the profile name doesn't match the channel:
  // "test4" tells the user nothing, "Nick Invests" does. Suggested inline
  // rather than applied automatically — the name may be deliberate, and a
  // silent rename of the thing they use to find the profile would be worse
  // than leaving it.
  const [renameTo, setRenameTo] = useState<string | null>(null)

  // The desktop app stores the linked channel across six flat columns; this
  // app stores one `youtube_channel` JSON blob. Both schemas exist in the
  // shared database — reading the blob here keeps this card's markup and
  // behaviour identical to the desktop's.
  const channel = profile?.youtube_channel ?? null
  const linked = channel != null

  const run = async (input: string): Promise<void> => {
    if (!profile || !input.trim()) return
    setBusy(true)
    try {
      const ch = await lookupChannel(input)
      onProfileSaved(await updateProfile(profile.id, { youtube_channel: ch }))
      setUrl('')
      setImgFailed(false)
      const title = ch.title.trim()
      setRenameTo(title && title !== profile.name.trim() ? title : null)
      onToast?.('info', `Linked ${ch.title}`)
    } catch (e) {
      onToast?.('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const unlink = async (): Promise<void> => {
    if (!profile) return
    setBusy(true)
    try {
      onProfileSaved(await updateProfile(profile.id, { youtube_channel: null }))
      onToast?.('info', 'Channel unlinked')
    } catch (e) {
      onToast?.('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const subs = channel?.subs ?? null

  return (
    <div className="sa-tile wide">
      <div className="sa-tk">
        <PlatformIcon platform="yt" size={14} />
        YouTube channel
      </div>

      {linked && profile ? (
        <div className="sa-chan">
          <span className="sa-chan-ic" aria-hidden="true">
            {channel.thumbnail && !imgFailed ? (
              <img src={channel.thumbnail} alt="" onError={() => setImgFailed(true)} />
            ) : (
              <PlatformIcon platform="yt" size={20} />
            )}
          </span>
          <div className="sa-chan-i">
            <div className="sa-chan-t">{channel.title}</div>
            <div className="sa-chan-s">
              {[channel.handle, subs ? `${subs} subscribers` : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <button
            type="button"
            className="sa-lk-x"
            aria-label="Refresh channel details"
            title="Refresh — subscriber counts are a snapshot"
            disabled={busy || disabled}
            onClick={() => void run(channel.channelId ?? '')}
          >
            <RefreshCw />
          </button>
          <button
            type="button"
            className="sa-lk-x"
            aria-label="Unlink channel"
            disabled={busy || disabled}
            onClick={() => void unlink()}
          >
            <X />
          </button>
        </div>
      ) : (
        <div className="sa-chan-add">
          <span className="sa-chan-ic" aria-hidden="true">
            <PlatformIcon platform="yt" size={20} />
          </span>
          <input
            className="sa-inp flex"
            value={url}
            placeholder="youtube.com/@handle"
            aria-label="YouTube channel URL"
            disabled={busy || disabled || !profile}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void run(url)
            }}
          />
          <button
            type="button"
            className="sa-form-go inline"
            disabled={busy || disabled || !profile || !url.trim()}
            onClick={() => void run(url)}
          >
            {busy ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
      )}

      {renameTo && (
        <div className="sa-rename" role="status">
          <span className="sa-rename-t">
            Rename this profile to <b>{renameTo}</b>?
          </span>
          <button
            type="button"
            className="sa-rename-go"
            disabled={busy || disabled}
            onClick={() => {
              onRename(renameTo)
              setRenameTo(null)
              onToast?.('info', `Renamed to ${renameTo}`)
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="sa-lk-x"
            aria-label="Keep the current name"
            onClick={() => setRenameTo(null)}
          >
            <X />
          </button>
        </div>
      )}

      <div className="sa-hint">
        {linked
          ? 'Name, handle and subscriber count were read from YouTube. Refresh to update them.'
          : 'Paste the channel URL to pull its name, handle and subscriber count.'}
      </div>
    </div>
  )
}
