// Supabase automations data layer. Mirrors lib/extensions.ts. RLS enforces
// every write server-side (automations.view/edit/run — see 0026_automations.sql).
// These are the typed query wrappers the renderer calls; the execution engine
// (lib/automations/engine.ts) and the page hook both go through this module.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import type { Trigger, Step, ProfileScope } from '../../../shared/automations/types'

export interface AutomationRow {
  id: string
  workspace_id: string
  name: string
  trigger: Trigger
  steps: Step[]
  enabled: boolean
  last_run_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// A row plus its resolved scope assignment (join tables) and derived run stats.
export interface AutomationWithMeta extends AutomationRow {
  groupIds: string[]
  profileIds: string[]
  runsCount: number
  lastRunAt: string | null
  lastRunStatus: string | null
}

function client(): SupabaseClient {
  const c = getSupabase()
  if (!c)
    throw new Error('Supabase not configured — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  return c
}

export async function listAutomations(workspaceId: string): Promise<AutomationWithMeta[]> {
  const c = client()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [autos, profs, grps, runs] = await Promise.all([
    c
      .from('automations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
    c
      .from('automation_profiles')
      .select('automation_id, profile_id')
      .eq('workspace_id', workspaceId),
    c.from('automation_groups').select('automation_id, group_id').eq('workspace_id', workspaceId),
    c
      .from('automation_runs')
      .select('automation_id, started_at, status')
      .eq('workspace_id', workspaceId)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
  ])
  if (autos.error) throw autos.error
  if (profs.error) throw profs.error
  if (grps.error) throw grps.error
  if (runs.error) throw runs.error

  const byProfile = groupBy(profs.data ?? [], 'automation_id', 'profile_id')
  const byGroup = groupBy(grps.data ?? [], 'automation_id', 'group_id')
  const runStats = new Map<
    string,
    { count: number; lastAt: string | null; lastStatus: string | null }
  >()
  for (const r of runs.data ?? []) {
    const cur = runStats.get(r.automation_id) ?? { count: 0, lastAt: null, lastStatus: null }
    cur.count += 1
    if (!cur.lastAt) {
      cur.lastAt = r.started_at
      cur.lastStatus = r.status
    }
    runStats.set(r.automation_id, cur)
  }

  return (autos.data ?? []).map((a) => {
    const row = a as AutomationRow
    const st = runStats.get(row.id)
    return {
      ...row,
      profileIds: byProfile.get(row.id) ?? [],
      groupIds: byGroup.get(row.id) ?? [],
      runsCount: st?.count ?? 0,
      lastRunAt: st?.lastAt ?? row.last_run_at,
      lastRunStatus: st?.lastStatus ?? null
    }
  })
}

function groupBy<T extends Record<string, string>>(
  rows: T[],
  key: string,
  val: string
): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const r of rows) {
    const arr = m.get(r[key]) ?? []
    arr.push(r[val])
    m.set(r[key], arr)
  }
  return m
}

export interface NewAutomationInput {
  workspace_id: string
  name: string
  trigger: Trigger
  steps: Step[]
  enabled?: boolean
  created_by: string | null
}

export async function createAutomation(input: NewAutomationInput): Promise<AutomationRow> {
  const { data, error } = await client()
    .from('automations')
    .insert({
      workspace_id: input.workspace_id,
      name: input.name,
      trigger: input.trigger,
      steps: input.steps,
      enabled: input.enabled ?? true,
      created_by: input.created_by
    })
    .select('*')
    .single()
  if (error) throw error
  const row = data as AutomationRow
  await writeScope(row.id, input.workspace_id, input.trigger)
  return row
}

export async function updateAutomation(
  id: string,
  workspaceId: string,
  fields: { name: string; trigger: Trigger; steps: Step[] }
): Promise<void> {
  const { error } = await client()
    .from('automations')
    .update({ name: fields.name, trigger: fields.trigger, steps: fields.steps })
    .eq('id', id)
  if (error) throw error
  await writeScope(id, workspaceId, fields.trigger)
}

export async function setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await client().from('automations').update({ enabled }).eq('id', id)
  if (error) throw error
}

export async function touchLastRun(id: string): Promise<void> {
  const { error } = await client()
    .from('automations')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteAutomation(id: string): Promise<void> {
  // Join + run rows cascade on delete (FK on delete cascade).
  const { error } = await client().from('automations').delete().eq('id', id)
  if (error) throw error
}

export async function duplicateAutomation(
  src: AutomationWithMeta,
  createdBy: string | null
): Promise<AutomationRow> {
  return createAutomation({
    workspace_id: src.workspace_id,
    name: `${src.name} (copy)`,
    trigger: src.trigger,
    steps: src.steps,
    enabled: true,
    created_by: createdBy
  })
}

// Rewrite the scope join tables to match the trigger's profileScope. Clears
// both, then inserts the active scope's rows. RLS gates each write on edit.
async function writeScope(id: string, workspaceId: string, trigger: Trigger): Promise<void> {
  const c = client()
  await c.from('automation_profiles').delete().eq('automation_id', id)
  await c.from('automation_groups').delete().eq('automation_id', id)
  const scope: ProfileScope = trigger.profileScope
  if (scope === 'profiles' && (trigger.profileIds?.length ?? 0) > 0) {
    const rows = trigger.profileIds!.map((profile_id) => ({
      automation_id: id,
      profile_id,
      workspace_id: workspaceId
    }))
    const { error } = await c.from('automation_profiles').insert(rows)
    if (error) throw error
  }
  if (scope === 'groups' && (trigger.groupIds?.length ?? 0) > 0) {
    const rows = trigger.groupIds!.map((group_id) => ({
      automation_id: id,
      group_id,
      workspace_id: workspaceId
    }))
    const { error } = await c.from('automation_groups').insert(rows)
    if (error) throw error
  }
}
