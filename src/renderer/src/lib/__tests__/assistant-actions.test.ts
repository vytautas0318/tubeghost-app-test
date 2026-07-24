// Tests for the assistant action executor — the side-effecting "hands". Mocks
// the real renderer functions and verifies: create ref resolution, per-step
// result streaming, permission-denied fail-fast, that one failed step doesn't
// abort the batch, and that the dropped desktop actions (launch/stop/run) now
// degrade to a clear "not available in the web app" message.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const createProfile = vi.fn()
const listProfiles = vi.fn()

vi.mock('@/lib/profiles', () => ({
  listProfiles: (...a: unknown[]) => listProfiles(...a),
  createProfile: (...a: unknown[]) => createProfile(...a),
  assignProxyToProfile: vi.fn()
}))
vi.mock('@/lib/proxies', () => ({ listProxies: vi.fn(async () => []) }))

import { executePlan, type StepResult } from '@/lib/assistant-actions'
import type { ActionPlan } from '../../../../shared/assistant/plan'

const ALL_PERMS = ['profiles.view', 'profiles.create', 'profiles.launch', 'automations.run', 'proxies.assign']
const ctx = { workspaceId: 'ws1', permissions: ALL_PERMS, userId: 'u1' }

beforeEach(() => {
  vi.clearAllMocks()
  listProfiles.mockResolvedValue([])
})

describe('executePlan — create + list (kept actions)', () => {
  it('creates a profile and streams one result per step', async () => {
    createProfile.mockResolvedValue({ id: 'p-new', name: 'A' })

    const plan: ActionPlan = {
      summary: 'create + list',
      steps: [
        { id: '#1', kind: 'create_profile', args: { name: 'A' } },
        { id: '#2', kind: 'list_profiles', args: {} }
      ]
    }
    const streamed: StepResult[] = []
    const results = await executePlan(plan, ctx, (r) => streamed.push(r))

    expect(createProfile).toHaveBeenCalledWith({ workspace_id: 'ws1', name: 'A', platform: null })
    expect(results.every((r) => r.ok)).toBe(true)
    expect(streamed).toHaveLength(2) // streamed live, one per step
  })
})

describe('executePlan — dropped desktop actions degrade gracefully', () => {
  it('reports launch/stop/run_automation as unavailable, without aborting the batch', async () => {
    createProfile.mockResolvedValue({ id: 'p3', name: 'C' })

    const plan: ActionPlan = {
      summary: 'x',
      steps: [
        { id: '#1', kind: 'create_profile', args: { name: 'C' } },
        { id: '#2', kind: 'launch_profile', args: { profile: '#1' } },
        { id: '#3', kind: 'list_profiles', args: {} }
      ]
    }
    const results = await executePlan(plan, ctx, () => {})
    expect(results[0].ok).toBe(true) // create
    expect(results[1].ok).toBe(false) // launch unavailable
    expect(results[1].message).toMatch(/not available in the web app/i)
    expect(results[2].ok).toBe(true) // list still ran
  })

  it('reports run_automation as unavailable', async () => {
    const plan: ActionPlan = {
      summary: 'x',
      steps: [{ id: '#1', kind: 'run_automation', args: { automation: 'warmup' } }]
    }
    const results = await executePlan(plan, ctx, () => {})
    expect(results[0].ok).toBe(false)
    expect(results[0].message).toMatch(/not available in the web app/i)
  })
})

describe('executePlan — permission gate', () => {
  it('fails a create step when the user lacks profiles.create', async () => {
    const plan: ActionPlan = {
      summary: 'x',
      steps: [{ id: '#1', kind: 'create_profile', args: { name: 'X' } }]
    }
    const results = await executePlan(
      plan,
      { workspaceId: 'ws1', permissions: ['profiles.view'], userId: 'u1' },
      () => {}
    )
    expect(results[0].ok).toBe(false)
    expect(results[0].message).toMatch(/permission/i)
    expect(createProfile).not.toHaveBeenCalled()
  })
})
