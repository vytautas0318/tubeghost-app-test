// The assistant's action executor — the "hands". Turns a validated ActionPlan
// into calls to the REAL renderer functions the UI uses (createProfile,
// launchProfile, …), so every RLS check, lock, fingerprint-gen and guardrail
// applies automatically. Per-step results are streamed back via onStep; one bad
// step never aborts the batch.
//
// Confirmation happens BEFORE this runs (in the UI) — reaching here means the
// user approved the plan.

import { listProfiles, createProfile, assignProxyToProfile, type ProfileRow } from '@/lib/profiles'
import { listProxies } from '@/lib/proxies'
import { can } from '@/lib/permissions'
import type { PermissionKey } from '@/lib/permissions'
import { ACTION_TOOLS, type ActionPlan, type PlanStep } from '../../../shared/assistant/plan'

export interface StepResult {
  stepId: string
  label: string
  ok: boolean
  message: string
}

export interface ExecContext {
  workspaceId: string
  permissions: string[]
  userId: string | null
}

const str = (a: Record<string, unknown>, k: string): string =>
  typeof a[k] === 'string' ? (a[k] as string).trim() : ''

// Find a profile by a plan ref (#1 → an earlier create result) or by name.
function resolveProfile(
  ref: string,
  created: Map<string, ProfileRow>,
  all: ProfileRow[]
): ProfileRow | null {
  if (ref.startsWith('#') && created.has(ref)) return created.get(ref)!
  const byName = all.find((p) => p.name.toLowerCase() === ref.toLowerCase())
  return byName ?? null
}

// Execute the whole plan sequentially, reporting each step as it finishes.
export async function executePlan(
  plan: ActionPlan,
  ctx: ExecContext,
  onStep: (r: StepResult) => void
): Promise<StepResult[]> {
  const results: StepResult[] = []
  // Refs from create steps → the created profile, so later steps can target it.
  const created = new Map<string, ProfileRow>()
  // Cache the profile list once; refresh after creates so name lookups work.
  let allProfiles = await listProfiles(ctx.workspaceId).catch(() => [] as ProfileRow[])

  for (const step of plan.steps) {
    const spec = ACTION_TOOLS[step.kind]
    const emit = (ok: boolean, message: string): void => {
      const r: StepResult = { stepId: step.id, label: spec.label, ok, message }
      results.push(r)
      onStep(r)
    }

    // Permission pre-check (RLS is still the real gate, but fail fast + clearly).
    if (!can(ctx.permissions, spec.permission as PermissionKey)) {
      emit(false, `You don't have permission to ${spec.label.toLowerCase()}.`)
      continue
    }

    try {
      await runStep(step, spec.kind, ctx, created, allProfiles, emit)
      // Keep the local list fresh after a create so subsequent name refs resolve.
      if (step.kind === 'create_profile') {
        allProfiles = await listProfiles(ctx.workspaceId).catch(() => allProfiles)
      }
    } catch (e) {
      emit(false, (e as Error).message || 'Action failed.')
    }
  }
  return results
}

async function runStep(
  step: PlanStep,
  kind: PlanStep['kind'],
  ctx: ExecContext,
  created: Map<string, ProfileRow>,
  allProfiles: ProfileRow[],
  emit: (ok: boolean, message: string) => void
): Promise<void> {
  switch (kind) {
    case 'list_profiles': {
      const n = allProfiles.length
      emit(true, `You have ${n} profile${n === 1 ? '' : 's'}.`)
      return
    }

    case 'create_profile': {
      const name = str(step.args, 'name') || `Profile ${created.size + 1}`
      const platform = str(step.args, 'platform') || null
      const row = await createProfile({ workspace_id: ctx.workspaceId, name, platform })
      created.set(step.id, row)
      emit(true, `Created "${row.name}".`)
      return
    }

    case 'assign_proxy': {
      const ref = str(step.args, 'profile')
      const profile = resolveProfile(ref, created, allProfiles)
      if (!profile) return emit(false, `Couldn't find profile "${ref}".`)
      const proxies = await listProxies(ctx.workspaceId).catch(() => [])
      const avail = proxies.find((p) => p.status === 'active')
      if (!avail) return emit(false, 'No active proxy available in your workspace pool.')
      const updated = await assignProxyToProfile(profile.id, {
        id: avail.id,
        proxy_type: avail.proxy_type,
        host: avail.host,
        port: avail.port,
        username: avail.username,
        password_encrypted: avail.password_encrypted,
        source: avail.source,
        tubeproxies_ip_id: avail.tubeproxies_ip_id
      })
      created.set(profile.id.startsWith('#') ? profile.id : `name:${updated.name}`, updated)
      emit(true, `Assigned proxy ${avail.host}:${avail.port} to "${updated.name}".`)
      return
    }

    // Launch / stop / run-automation drove the local browser engine, which the
    // web app doesn't do. These plan steps degrade to a clear message instead.
    case 'launch_profile':
    case 'stop_profile':
    case 'run_automation': {
      emit(false, 'Launching profiles and running automations is not available in the web app.')
      return
    }
  }
}
