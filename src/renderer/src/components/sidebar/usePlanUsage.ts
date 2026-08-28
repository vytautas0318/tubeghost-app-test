import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

/**
 * Read-only profile-usage for the sidebar plan card: how many profiles the
 * workspace has vs. its EFFECTIVE cap. Display only — no mutations.
 *
 * The cap is `workspaces.purchased_profiles` when the workspace bought
 * capacity, falling back to `plans.profile_limit` otherwise. Team is a
 * configurator — you buy the profile count — so its plans row holds only the
 * tier floor (25). Reading that alone showed "5/25" in the sidebar while
 * Billing correctly showed "5 of 100" for the same workspace.
 *
 * Derived exactly as useBillingData/useBilling do so the surfaces agree.
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
    if (!plan || !c || !workspaceId) {
      setLimit(null)
      return
    }
    let cancelled = false
    void Promise.all([
      c.from('plans').select('profile_limit').eq('plan_key', plan).single(),
      c.from('workspaces').select('purchased_profiles').eq('id', workspaceId).maybeSingle()
    ]).then(([planResp, wsResp]) => {
      if (cancelled) return
      const tierFloor = (planResp.data as { profile_limit?: number } | null)?.profile_limit ?? null
      const purchased =
        (wsResp.data as { purchased_profiles?: number | null } | null)?.purchased_profiles ?? null
      setLimit(purchased != null && purchased > 0 ? purchased : tierFloor)
    })
    return () => {
      cancelled = true
    }
  }, [plan, workspaceId])

  return { used, limit }
}
