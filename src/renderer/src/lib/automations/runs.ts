// Run-tracking data layer: create a run row when an automation starts, patch
// per-profile results as the engine progresses, and finalize on completion.
// RLS gates create/update on automations.edit (see 0026_automations.sql).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import type { ProfileResult, RunStatus } from '../../../../shared/automations/types'

function client(): SupabaseClient {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured')
  return c
}

export interface RunRow {
  id: string
  automation_id: string
  workspace_id: string
  started_at: string
  finished_at: string | null
  status: RunStatus
  profile_results: ProfileResult[]
  triggered_by: string | null
  triggered_by_kind: 'user' | 'schedule'
}

export async function createRun(input: {
  automationId: string
  workspaceId: string
  triggeredBy: string | null
  triggeredByKind: 'user' | 'schedule'
  profileResults: ProfileResult[]
}): Promise<RunRow> {
  const { data, error } = await client()
    .from('automation_runs')
    .insert({
      automation_id: input.automationId,
      workspace_id: input.workspaceId,
      status: 'running',
      profile_results: input.profileResults,
      triggered_by: input.triggeredBy,
      triggered_by_kind: input.triggeredByKind
    })
    .select('*')
    .single()
  if (error) throw error
  return data as RunRow
}

// Persist the current per-profile results snapshot (best-effort progress write).
export async function patchRunResults(runId: string, results: ProfileResult[]): Promise<void> {
  const { error } = await client()
    .from('automation_runs')
    .update({ profile_results: results })
    .eq('id', runId)
  if (error) throw error
}

export async function finalizeRun(
  runId: string,
  status: RunStatus,
  results: ProfileResult[]
): Promise<void> {
  const { error } = await client()
    .from('automation_runs')
    .update({ status, profile_results: results, finished_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) throw error
}

// The most recent runs for one automation (for the runs drawer).
export async function listRunsForAutomation(automationId: string, limit = 20): Promise<RunRow[]> {
  const { data, error } = await client()
    .from('automation_runs')
    .select('*')
    .eq('automation_id', automationId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as RunRow[]
}

// Engagement actions run in the last 24h for a profile, across ALL runs — feeds
// the per-account daily cap (§8/§10). Counts step logs with status 'ok' whose
// type is an engagement action.
export async function countRecentEngagement(
  workspaceId: string,
  profileId: string
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await client()
    .from('automation_runs')
    .select('profile_results')
    .eq('workspace_id', workspaceId)
    .gte('started_at', since)
  if (error) throw error
  const engagement = new Set(['like_video', 'post_comment', 'subscribe'])
  let n = 0
  for (const row of (data ?? []) as { profile_results: ProfileResult[] }[]) {
    for (const pr of row.profile_results ?? []) {
      if (pr.profileId !== profileId) continue
      for (const log of pr.stepLogs ?? []) {
        if (log.status === 'ok' && engagement.has(log.type)) n += 1
      }
    }
  }
  return n
}
