// Per-member resource counts + the plan's seat limit for the Members page
// header. Counts are attribution by `created_by` (profiles/proxies created by
// that member in this workspace) — cheap at v1 scale, aggregated client-side.

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { listProxies } from '@/lib/proxies'

export interface MemberStats {
  profileCounts: Map<string, number>
  proxyCounts: Map<string, number>
  seatLimit: number | null
}

const EMPTY: MemberStats = {
  profileCounts: new Map(),
  proxyCounts: new Map(),
  seatLimit: null
}

function tally(rows: Array<{ created_by: string | null }>): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!r.created_by) continue
    m.set(r.created_by, (m.get(r.created_by) ?? 0) + 1)
  }
  return m
}

export function useMemberStats(workspaceId: string | null, plan: string | null): MemberStats {
  const [stats, setStats] = useState<MemberStats>(EMPTY)

  useEffect(() => {
    // No sync reset on missing workspace: the fetch below overwrites stale
    // stats as soon as a workspace id is available again.
    if (!workspaceId) return
    const supabase = getSupabase()
    if (!supabase) return
    let cancelled = false

    Promise.all([
      supabase.from('browser_profiles').select('created_by').eq('workspace_id', workspaceId),
      // Merged list: custom rows from ghost.proxies plus purchased rows read
      // live from TubeProxies (created_by = the buying user).
      listProxies(workspaceId).then((rows) => ({ data: rows })),
      plan
        ? supabase.from('plans').select('member_seat_limit').eq('plan_key', plan).maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ])
      .then(([pf, px, pl]) => {
        if (cancelled) return
        setStats({
          profileCounts: tally((pf.data ?? []) as Array<{ created_by: string | null }>),
          proxyCounts: tally((px.data ?? []) as Array<{ created_by: string | null }>),
          seatLimit: (pl.data as { member_seat_limit?: number } | null)?.member_seat_limit ?? null
        })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [workspaceId, plan])

  return stats
}
