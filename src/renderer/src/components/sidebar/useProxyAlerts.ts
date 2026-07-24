import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

/**
 * Count of proxies in the workspace that need attention (expired or errored) —
 * shown as the amber badge on the sidebar Proxies item. Display only.
 */
export function useProxyAlerts(workspaceId: string | null): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const c = getSupabase()
    if (!workspaceId || !c) {
      setCount(0)
      return
    }
    let cancelled = false
    void c
      .from('proxies')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('status', ['expired', 'error'])
      .then(({ count: n }) => {
        if (!cancelled) setCount(n ?? 0)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  return count
}
