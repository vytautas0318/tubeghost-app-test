import { useEffect, useState } from 'react'
import { getProxyStock } from '@/lib/tubeproxies-stock'

/**
 * Live proxy inventory, so the buy page can't offer a tier TubeProxies can't
 * fulfil.
 *
 * `available === null` means the lookup failed or hasn't finished. Callers
 * must treat that as "unknown" and leave buying enabled — checkout re-checks
 * inventory server-side, so a failed count should never block a real sale.
 */
export function useProxyStock(): { available: number | null; loaded: boolean } {
  const [available, setAvailable] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getProxyStock()
      .then((s) => {
        if (!cancelled) setAvailable(s.available)
      })
      .catch(() => {
        if (!cancelled) setAvailable(null)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { available, loaded }
}
