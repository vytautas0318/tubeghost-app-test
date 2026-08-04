import { useEffect, useState } from 'react'
import { listProxies } from '@/lib/proxies'

/**
 * Count of proxies in the workspace that need attention (expired or errored) —
 * shown as the amber badge on the sidebar Proxies item. Display only.
 *
 * Goes through listProxies() so PURCHASED proxies count too. They are read
 * live from TubeProxies, so an expiry set by the expire-overdue-proxies cron
 * raises this badge immediately — which is the point: expired proxies are
 * kept rather than deleted, so this badge is how the user finds out one
 * lapsed. Under the old copy-based sync it could never fire for them,
 * because their local copy stayed 'active' forever.
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
