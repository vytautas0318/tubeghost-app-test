import { useEffect, useState } from 'react'
import { listProxies } from '@/lib/proxies'

/**
 * Count of proxies in the workspace that need attention (expired or errored) —
 * shown as the amber badge on the sidebar Proxies item. Display only.
 *
 * Counts CUSTOM proxies in practice. Purchased proxies are read live and
 * filtered to active only — an expired one leaves TubeGhost entirely rather
 * than lingering as an alert, matching the TubeProxies dashboard
 * (decision 2026-08-04). Still routed through listProxies() so that if that
 * rule is ever relaxed, the badge reflects it without another change here.
 */
export function useProxyAlerts(workspaceId: string | null): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!workspaceId) {
      setCount(0)
      return
    }
    let cancelled = false
    listProxies(workspaceId)
      .then((rows) => {
        if (cancelled) return
        setCount(rows.filter((r) => r.status === 'expired' || r.status === 'error').length)
      })
      .catch(() => {
        if (!cancelled) setCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  return count
}
