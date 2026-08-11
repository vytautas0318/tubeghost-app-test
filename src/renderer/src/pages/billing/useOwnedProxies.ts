import { useEffect, useState } from 'react'
import { listPurchasedProxies } from '@/lib/proxies'

/**
 * How many TubeProxies proxies this workspace already holds, ACTIVE only.
 *
 * Used to hide proxy bundles the user would gain nothing from. TubeProxies'
 * assign_proxies_immediately() assigns
 *
 *   max_assignable = greatest(0, subscription.proxy_limit - active_count)
 *
 * so buying a bundle at or below the count they already hold assigns ZERO
 * proxies — the customer is charged and receives nothing, with no error.
 *
 * Expired rows are excluded deliberately: the RPC returns them so the user
 * can see a lapsed proxy, but that function counts `status = 'active'` only,
 * and counting expired rows here would hide bundles the user COULD use.
 */
export function useOwnedProxies(workspaceId: string | null): {
  active: number
  loaded: boolean
} {
  const [active, setActive] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    listPurchasedProxies(workspaceId)
      .then((rows) => {
        if (cancelled) return
        setActive(rows.filter((r) => r.status === 'active').length)
      })
      .catch(() => {
        // Unknown count: leave it at 0 so every bundle stays offered. A
        // failed lookup must not block a legitimate purchase — the worst
        // case is the existing behaviour.
        if (!cancelled) setActive(0)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  return { active, loaded }
}
