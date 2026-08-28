// Surfaces "this profile is open elsewhere" with an admin-only force
// unlock affordance. Renders nothing when the profile is unlocked or
// when the current user holds the lock.

import * as React from 'react'
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useHasPermission } from '@/lib/permissions'
import { forceReleaseProfileLock } from '@tubeghost/ui'
import type { ProfileRow } from '@/lib/profiles'

const sinceLabel = (iso: string | null): string => {
  if (!iso) return 'unknown'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  return `${Math.round(ms / 3_600_000)}h ago`
}

export function LockBanner({
  profile,
  currentUserId,
  onForceUnlocked
}: {
  profile: ProfileRow
  currentUserId: string | null
  onForceUnlocked: () => void
}): React.ReactElement | null {
  const canForce = useHasPermission('profiles.force_unlock')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!profile.open_session_id) return null
  // Hide if current user already holds the lock — they're the one
  // who launched it; a banner here would just be noise.
  if (profile.open_by_user_id && profile.open_by_user_id === currentUserId) return null

  const onForce = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await forceReleaseProfileLock(profile.id)
      setConfirming(false)
      onForceUnlocked()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-[var(--amber-soft)] border border-[var(--amber)]/25 rounded-xl px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 text-[var(--amber)] mt-0.5 shrink-0" />
      <div className="flex-1 text-xs">
        <div className="font-semibold text-[var(--amber)]">
          In use on {profile.open_by_device ?? 'another device'}
        </div>
        <div className="text-[var(--amber)]/80 mt-0.5">
          Last heartbeat {sinceLabel(profile.open_heartbeat_at)} · opened{' '}
          {sinceLabel(profile.open_at)}
        </div>
        {error && <div className="mt-1 text-[var(--red)]">{error}</div>}
      </div>
      {canForce &&
        (confirming ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onForce}
              disabled={busy}
              className="px-2.5 py-1 text-xs font-medium bg-[var(--amber)] text-white rounded hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Releasing…' : 'Confirm release'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="px-2.5 py-1 text-xs font-medium border border-[var(--amber)]/25 text-[var(--amber)] rounded hover:bg-amber-100/40 dark:hover:bg-amber-950/50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="px-2.5 py-1 text-xs font-medium border border-amber-400 dark:border-amber-900/60 text-[var(--amber)] rounded hover:bg-amber-100/40 dark:hover:bg-amber-950/50"
          >
            Force unlock
          </button>
        ))}
    </div>
  )
}
