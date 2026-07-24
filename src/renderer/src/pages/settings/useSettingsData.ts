// Shared loader for the workspace-scope Settings panels (General / Fingerprint
// / Network). One round-trip for the settings row + groups list; exposes a
// `saving` helper that wraps a mutation with toast + error handling.

import { useCallback, useEffect, useState } from 'react'
import { getWorkspaceSettings, type WorkspaceSettings } from '@/lib/settings'
import { listGroups, type GroupRow } from '@/lib/groups'

export interface SettingsData {
  loading: boolean
  settings: WorkspaceSettings | null
  groups: GroupRow[]
  reload: () => void
}

export function useSettingsData(workspaceId: string | null): SettingsData {
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    Promise.all([getWorkspaceSettings(workspaceId), listGroups(workspaceId)])
      .then(([s, g]) => {
        if (cancelled) return
        setSettings(s)
        setGroups(g)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, nonce])

  return { loading, settings, groups, reload }
}
