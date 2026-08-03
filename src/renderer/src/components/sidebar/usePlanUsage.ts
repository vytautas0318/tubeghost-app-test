import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

/**
 * Read-only profile-usage for the sidebar plan card: how many profiles the
 * workspace has vs. its plan's profile_limit. Display only — no mutations.
 */
export function usePlanUsage(
  workspaceId: string | null,
  plan: string | undefined
): { used: number | null; limit: number | null } {
  const [used, setUsed] = useState<number | null>(null)
  const [limit, setLimit] = useState<number | null>(null)

  useEffect(() => {
    const c = getSupabase()
    if (!workspaceId || !c) {
      setUsed(null)
      return
    }
    let cancelled = false
    void c
      .from('browser_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .then(({ count }) => {
        if (!cancelled) setUsed(count ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  useEffect(() => {
    const c = getSupabase()
    if (!plan || !c) {
      setLimit(null)
      return
    }
    let cancelled = false
    void c
      .from('plans')
      .select('profile_limit')
      .eq('plan_key', plan)
      .single()
      .then(({ data }) => {
        if (!cancelled) setLimit((data as { profile_limit?: number } | null)?.profile_limit ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [plan])

  return { used, limit }
}
