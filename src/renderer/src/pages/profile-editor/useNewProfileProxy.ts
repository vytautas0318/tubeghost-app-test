// Owns the creation-time proxy draft + the unused-pool preview.
//
// Lives in ProfileEditor (not in the Proxy tab) so the choice survives tab
// switches AND so the General tab can show a summary of what will be
// attached — the point of the single-step flow is that the user doesn't have
// to go hunting for it.

import { useEffect, useState } from 'react'
import { listUnusedProxies, type ProxyRow } from '@/lib/proxies'
import { useWorkspace } from '@/store/workspace'
import { initialProxyDraft, type ProxyDraft } from './proxy-draft'

export interface NewProfileProxyState {
  draft: ProxyDraft
  setDraft: (next: ProxyDraft) => void
  // Unused proxies, best candidate first. null while loading.
  unused: ProxyRow[] | null
  unusedError: string | null
  refreshUnused: () => void
}

export function useNewProfileProxy(enabled: boolean): NewProfileProxyState {
  const workspace = useWorkspace((s) => s.current)
  const [draft, setDraft] = useState<ProxyDraft>(initialProxyDraft)
  const [unused, setUnused] = useState<ProxyRow[] | null>(null)
  const [unusedError, setUnusedError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled || !workspace) return
    let cancelled = false
    listUnusedProxies(workspace.workspace_id)
      .then((rows) => {
        if (cancelled) return
        setUnused(rows)
        setUnusedError(null)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setUnused([])
        setUnusedError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, workspace?.workspace_id, nonce])

  return {
    draft,
    setDraft,
    unused,
    unusedError,
    refreshUnused: () => setNonce((n) => n + 1)
  }
}
