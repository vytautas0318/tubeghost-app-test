// Auto-create the profile row when the Advanced editor opens on a NEW profile.
//
// WHY. Every Advanced card persists by profile.id — assignProxyToProfile(id,…),
// updateProfile(id,…). With no row those tabs could only show a "Save to
// unlock" placeholder, so configuring a profile took two passes: save basic
// info, wait, then set proxy and fingerprint. Creating the row up front makes
// every tab editable immediately with no card changes at all — the cards and
// the existing save-all machinery work exactly as they do when editing an
// existing profile.
//
// This is safe because createProfile() seeds a COMPLETE, coherent profile
// (device, UA, fingerprint preset, safe-by-default network). A fresh row is a
// valid profile, not a stub — the user is editing it rather than assembling it.
//
// The row is inserted with is_draft = true (migration 00000000000020), so
// until the user saves it is hidden from the profiles list and excluded from
// the plan's profile limit. Save clears the flag via commitProfileDraft();
// Cancel / navigating away discards it.

import { useEffect, useRef, useState } from 'react'
import { createProfile, discardProfileDraft, type ProfileRow, updateProfile } from '@/lib/profiles'

export interface UseDraftProfile {
  // The auto-created row, once it exists.
  draft: ProfileRow | null
  creating: boolean
  error: string | null
  // Called by the save path once the draft has been committed, so unmount
  // stops treating it as disposable.
  markCommitted: () => void
  // Discard the draft now (Cancel). Safe to call when there is nothing to
  // discard.
  discard: () => Promise<void>
}

export function useDraftProfile({
  enabled,
  workspaceId,
  name,
  platform
}: {
  // Only true for a NEW profile in a mode whose cards need a row.
  enabled: boolean
  workspaceId: string | null
  // Initial name for the inserted row; the editor renames it on save.
  name: string
  // Platform the user already chose in Simple/Guided. Without this the draft
  // row takes the DB default and Advanced renders its own 'windows' fallback,
  // so picking macOS in Simple and switching to Advanced showed Windows.
  platform?: string
}): UseDraftProfile {
  const [draft, setDraft] = useState<ProfileRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Insert exactly once per editor session. A ref (not state) because React 18
  // StrictMode double-invokes effects in dev — without this guard that would
  // create two rows.
  const startedRef = useRef(false)
  const committedRef = useRef(false)
  // Read by the unmount cleanup, which must not close over a stale draft.
  const draftRef = useRef<ProfileRow | null>(null)

  // The row is inserted once (startedRef), so a platform change made in Simple
  // AFTER the draft already exists would not reach it -- switch back to
  // Advanced and the two modes disagree again. Keep the existing row in step.
  // `draft` (state), not draftRef: the ref is populated inside the create
  // promise and mutating it doesn't re-run this effect, so a platform change
  // made WHILE the initial insert was in flight used to be lost. Depending on
  // the state value means this re-runs the moment the row lands.
  useEffect(() => {
    const row = draft
    if (!row || !platform || row.platform === platform) return
    void updateProfile(row.id, { platform })
      .then((updated) => {
        draftRef.current = updated
        setDraft(updated)
      })
      .catch(() => undefined)
  }, [platform, draft])

  useEffect(() => {
    if (!enabled || !workspaceId || startedRef.current) return
    startedRef.current = true
    setCreating(true)
    createProfile({
      workspace_id: workspaceId,
      name,
      is_draft: true,
      ...(platform ? { platform } : {})
    })
      .then((row) => {
        draftRef.current = row
        setDraft(row)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCreating(false))
  }, [enabled, workspaceId, name, platform])

  // Abandoned editor: drop the row. Fire-and-forget — the component is going
  // away, and a draft that survives a failed delete is invisible anyway.
  useEffect(() => {
    return () => {
      const row = draftRef.current
      if (!row || committedRef.current) return
      void discardProfileDraft(row.id).catch(() => undefined)
    }
  }, [])

  return {
    draft,
    creating,
    error,
    markCommitted: () => {
      committedRef.current = true
    },
    discard: async () => {
      const row = draftRef.current
      if (!row || committedRef.current) return
      committedRef.current = true // stop unmount double-deleting
      draftRef.current = null
      setDraft(null)
      await discardProfileDraft(row.id).catch(() => undefined)
    }
  }
}
