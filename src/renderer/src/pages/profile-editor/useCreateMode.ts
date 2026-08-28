// Create-page state: which detail level is showing, and the Guided flow's
// proxy choice + free-proxy count.
//
// Extracted from ProfileEditor so that file stays an orchestrator. Only
// meaningful while creating; the edit path ignores all of it.

import { useEffect, useState } from 'react'
import { listProxies } from '@/lib/proxies'
import { listProfiles } from '@/lib/profiles'
import type { ProfileView } from '@/store/prefs'

export type CreateDetail = 'guided' | 'simple' | 'advanced'

export interface UseCreateMode {
  detail: CreateDetail
  setDetail: (d: CreateDetail) => void
  assignProxy: boolean
  setAssignProxy: (v: boolean) => void
  freeProxies: number
}

export function useCreateMode(
  isNew: boolean,
  workspaceId: string | null,
  storedView: ProfileView
): UseCreateMode {
  // Follows the user's stored default view (Settings → Appearance), so create
  // opens the same way the rest of the app does. Guided is never automatic —
  // it's a deliberate choice from the switcher, not something a user who has
  // already picked Simple gets pushed into.
  const [detail, setDetail] = useState<CreateDetail>(() =>
    storedView === 'advanced' ? 'advanced' : 'simple'
  )
  const [assignProxy, setAssignProxy] = useState(true)
  const [freeProxies, setFreeProxies] = useState(0)

  // How many pool proxies have no profile — drives the Guided step-3 copy so
  // it never promises an assignment that can't happen.
  useEffect(() => {
    if (!isNew || !workspaceId) return
    let cancelled = false
    void Promise.all([listProxies(workspaceId), listProfiles(workspaceId)])
      .then(([proxies, profiles]) => {
        if (cancelled) return
        const taken = new Set(
          profiles.filter((p) => p.proxy_host).map((p) => `${p.proxy_host}:${p.proxy_port}`)
        )
        setFreeProxies(proxies.filter((p) => !taken.has(`${p.host}:${p.port}`)).length)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [isNew, workspaceId])

  return { detail, setDetail, assignProxy, setAssignProxy, freeProxies }
}
