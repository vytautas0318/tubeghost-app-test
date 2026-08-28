// The editor's save orchestration, extracted from ProfileEditor to keep that
// file a thin orchestrator (250-line cap).
//
// Two paths, deliberately separate:
//   • Simple — writes ONLY the fields the user operated (useSimpleDraft's
//     touched set). An untouched profile yields an empty patch and no write at
//     all, which is what makes opening-and-saving non-destructive.
//   • Advanced — flushes each card's registered saver, then the General form.

import { commitProfileDraft, updateProfile, type ProfileRow } from '@/lib/profiles'
import type { ProxyRow } from '@/lib/proxies'
import type { UseSimpleDraft } from './useSimpleDraft'
import type { ProfileView } from '@/store/prefs'

export function useEditorSave({
  mode,
  isNew,
  id,
  profile,
  workspaceId,
  simple,
  assignProxy,
  pendingProxy,
  draftProfile,
  onDraftCommitted,
  dirty,
  data,
  save,
  navigate
}: {
  mode: ProfileView
  isNew: boolean
  id?: string
  profile: ProfileRow | null
  workspaceId: string | null
  simple: UseSimpleDraft
  dirty: { runAllSavers: () => Promise<{ ok: boolean; key?: string; error?: string }> }
  data: { setProfile: (p: ProfileRow) => void; setError: (e: string | null) => void }
  save: (
    workspaceId: string,
    isNew: boolean,
    id?: string,
    platform?: string | null
  ) => Promise<ProfileRow | null>
  navigate: (to: string) => void
  // Guided step 3 / Simple's proxy tile: attach a pool proxy at insert.
  assignProxy?: boolean
  // A specific proxy the user picked on the create screen. Takes precedence
  // over the assignProxy auto-pick — an explicit choice beats "any free one".
  pendingProxy?: ProxyRow | null
  // Advanced-mode auto-created draft row, if one exists (see useDraftProfile).
  draftProfile?: ProfileRow | null
  // Tells useDraftProfile the row is committed, so unmount won't delete it.
  onDraftCommitted?: () => void
}): () => Promise<void> {
  return async (): Promise<void> => {
    if (!workspaceId) return

    // CREATE in Simple: the generic save() only writes name/group/notes/tags,
    // so anything the user set in the Simple tiles (device, engine version,
    // seed, YouTube preset) would be dropped. Insert first — createProfile
    // seeds a coherent device — then apply the user's own choices on top.
    if (mode === 'simple' && isNew) {
      try {
        const created = await save(workspaceId, true, undefined, simple.draft.platform)
        if (!created) return
        const patch = simple.buildPatch()
        // platform went in at insert (above) so the seeded device is coherent;
        // this writes the rest of the user's Simple choices.
        if (Object.keys(patch).length > 0) await updateProfile(created.id, patch)
        // Attach a pool proxy when the user asked for one. Best-effort: an
        // empty pool must not fail the create — the profile exists and a proxy
        // can be attached later, so we surface nothing and move on.
        // The user picked a specific proxy before the row existed — attach
        // exactly that one. Unlike the auto-pick below this is an explicit
        // choice, so a failure is worth surfacing rather than swallowing.
        if (pendingProxy) {
          try {
            const { assignProxyToProfile } = await import('@/lib/profiles')
            await assignProxyToProfile(created.id, {
              id: pendingProxy.id,
              proxy_type: pendingProxy.proxy_type,
              host: pendingProxy.host,
              port: pendingProxy.port,
              username: pendingProxy.username,
              password_encrypted: pendingProxy.password_encrypted,
              source: pendingProxy.source,
              tubeproxies_ip_id: pendingProxy.tubeproxies_ip_id
            })
          } catch (e) {
            data.setError(`Profile created, but the proxy could not be attached: ${
              (e as Error).message
            }`)
          }
        } else if (assignProxy) {
          try {
            const { listProxies } = await import('@/lib/proxies')
            const { assignProxyToProfile, listProfiles } = await import('@/lib/profiles')
            const [pool, profiles] = await Promise.all([
              listProxies(workspaceId),
              listProfiles(workspaceId)
            ])
            const taken = new Set(
              profiles
                .filter((p) => p.proxy_host && p.id !== created.id)
                .map((p) => `${p.proxy_host}:${p.proxy_port}`)
            )
            const free = pool.find((p) => !taken.has(`${p.host}:${p.port}`))
            if (free) {
              await assignProxyToProfile(created.id, {
                id: free.id,
                proxy_type: free.proxy_type,
                host: free.host,
                port: free.port,
                username: free.username,
                password_encrypted: free.password_encrypted,
                source: free.source,
                tubeproxies_ip_id: free.tubeproxies_ip_id
              })
            }
          } catch {
            /* pool unavailable — profile is created, proxy stays unassigned */
          }
        }
        navigate('/profiles')
      } catch (e) {
        data.setError((e as Error).message)
      }
      return
    }

    if (mode === 'simple' && !isNew && profile) {
      const patch = simple.buildPatch()
      try {
        if (Object.keys(patch).length > 0) {
          const updated = await updateProfile(profile.id, patch)
          data.setProfile(updated)
          simple.reset(updated)
        }
        navigate('/profiles')
      } catch (e) {
        data.setError((e as Error).message)
      }
      return
    }

    // Advanced on a new profile with an auto-created draft: the row already
    // exists and the cards have been writing to it directly, so this is an
    // UPDATE path, not an insert. Run the savers, persist General onto the
    // draft, then promote it out of draft state.
    if (isNew && draftProfile?.id) {
      const all = await dirty.runAllSavers()
      if (!all.ok) {
        data.setError(`${all.key}: ${all.error}`)
        return
      }
      try {
        // isNew=false so save() UPDATEs the draft instead of inserting again.
        const saved = await save(workspaceId, false, draftProfile.id)
        if (!saved) return
        // Last step: the plan-limit trigger fires here, so a user over their
        // cap is told no at commit rather than silently gaining a profile.
        const committed = await commitProfileDraft(draftProfile.id)
        data.setProfile(committed)
        onDraftCommitted?.()
        navigate('/profiles')
      } catch (e) {
        data.setError((e as Error).message)
      }
      return
    }

    if (!isNew) {
      const all = await dirty.runAllSavers()
      if (!all.ok) {
        data.setError(`${all.key}: ${all.error}`)
        return
      }
    }
    const r = await save(workspaceId, isNew, id)
    if (r) navigate('/profiles')
  }
}
