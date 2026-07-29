import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeRedis } from './fake-redis.js'

// ── Shared fakes ────────────────────────────────────────────────────
const redis = new FakeRedis()
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() { return redis } } }))
// Ratelimit → always allow (rate limiting is not the point of these tests).
vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow(): object {
      return {}
    }
    async limit(): Promise<{ success: boolean }> {
      return { success: true }
    }
  }
  return { Ratelimit }
})

// In-memory device + command_log tables, user-scoped.
interface Dev {
  id: string
  user_id: string
  name: string
  platform: string | null
  app_version: string | null
  revoked_at: string | null
  write_enabled: boolean
  last_seen_at: string | null
  created_at: string
}
const devices: Dev[] = []
const commandLog: Record<string, { user_id: string; tool: string; status: string }> = {}

vi.mock('../db.js', () => ({
  listDevices: vi.fn(async (userId: string) => devices.filter((d) => d.user_id === userId && !d.revoked_at)),
  getDeviceById: vi.fn(async (userId: string, id: string) =>
    devices.find((d) => d.id === id && d.user_id === userId) ?? null,
  ),
  insertCommandLog: vi.fn(async (row: { id: string; user_id: string; tool: string; status: string }) => {
    commandLog[row.id] = { user_id: row.user_id, tool: row.tool, status: row.status }
  }),
  updateCommandLog: vi.fn(async (id: string, patch: { status?: string }) => {
    if (commandLog[id] && patch.status) commandLog[id].status = patch.status
  }),
  getCommandLogById: vi.fn(async (userId: string, id: string) =>
    commandLog[id] && commandLog[id].user_id === userId ? { ...commandLog[id], id, device_id: null } : null,
  ),
}))

import { executeTool } from '../executor.js'

// The relay's presence key format (see bus.ts) — stable contract.
const presenceKey = (id: string): string => `presence:${id}`

function addDevice(over: Partial<Dev> & { id: string; user_id: string }): Dev {
  const d: Dev = {
    name: over.id,
    platform: 'macOS',
    app_version: '1.0.0',
    revoked_at: null,
    write_enabled: true,
    last_seen_at: null,
    created_at: new Date().toISOString(),
    ...over,
  }
  devices.push(d)
  return d
}
async function markOnline(id: string): Promise<void> {
  await redis.set(presenceKey(id), '1', { ex: 45 })
}

beforeEach(() => {
  redis.clear()
  devices.length = 0
  for (const k of Object.keys(commandLog)) delete commandLog[k]
})

describe('device resolution (0 / 1 / many online)', () => {
  it('NO_DEVICE when the user has no paired device', async () => {
    const out = await executeTool('userA', 'stop_profile', { profile_id: 'p1' })
    expect(out.isError).toBe(true)
    expect((out.structuredContent.error as { code: string }).code).toBe('NO_DEVICE')
  })

  it('NO_DEVICE when devices exist but none online', async () => {
    addDevice({ id: 'd1', user_id: 'userA' })
    const out = await executeTool('userA', 'stop_profile', { profile_id: 'p1' })
    expect((out.structuredContent.error as { code: string }).code).toBe('NO_DEVICE')
  })

  it('auto-resolves the single online device', async () => {
    addDevice({ id: 'd1', user_id: 'userA' })
    await markOnline('d1')
    // Use an async tool: it returns { running } immediately (a sync tool would
    // block awaiting a device result that never comes). Proves resolution +
    // enqueue to d1.
    const out = await executeTool('userA', 'launch_profile', { profile_id: 'p1' })
    expect(out.isError).toBe(false)
    expect(out.structuredContent.status).toBe('running')
    expect(await redis.rpop('q:d1')).toBeTruthy()
  })

  it('AMBIGUOUS_DEVICE when 2+ are online', async () => {
    addDevice({ id: 'd1', user_id: 'userA' })
    addDevice({ id: 'd2', user_id: 'userA' })
    await markOnline('d1')
    await markOnline('d2')
    const out = await executeTool('userA', 'stop_profile', { profile_id: 'p1' })
    expect((out.structuredContent.error as { code: string }).code).toBe('AMBIGUOUS_DEVICE')
  })
})

describe('cross-user isolation', () => {
  it('user A cannot enqueue to user B’s device by passing its id', async () => {
    addDevice({ id: 'dB', user_id: 'userB' })
    await markOnline('dB')
    const out = await executeTool('userA', 'stop_profile', { device_id: 'dB', profile_id: 'p1' })
    expect((out.structuredContent.error as { code: string }).code).toBe('DEVICE_NOT_FOUND')
    // Nothing was queued on B’s device.
    expect(await redis.rpop('q:dB')).toBeNull()
  })

  it('get_command_status of another user’s command → NOT_FOUND', async () => {
    commandLog['cmd-b'] = { user_id: 'userB', tool: 'launch_profile', status: 'succeeded' }
    const out = await executeTool('userA', 'get_command_status', { command_id: 'cmd-b' })
    expect((out.structuredContent.error as { code: string }).code).toBe('NOT_FOUND')
  })
})

describe('write gate', () => {
  it('WRITE_DISABLED when the per-device toggle is off', async () => {
    addDevice({ id: 'd1', user_id: 'userA', write_enabled: false })
    await markOnline('d1')
    const out = await executeTool('userA', 'create_profile', { name: 'x' })
    expect((out.structuredContent.error as { code: string }).code).toBe('WRITE_DISABLED')
  })

  it('read-only tools bypass the write gate', async () => {
    addDevice({ id: 'd1', user_id: 'userA', write_enabled: false })
    await markOnline('d1')
    // list_profiles is a sync read tool: it passes the (bypassed) write gate and
    // enqueues, then blocks awaiting a device result. Don't wait for the block —
    // start it, seed a result so it returns fast, and assert no WRITE_DISABLED.
    const p = executeTool('userA', 'list_profiles', {})
    // Give the executor a couple ticks to enqueue + start polling.
    await new Promise((r) => setTimeout(r, 30))
    const queued = await redis.rpop<string>('q:d1')
    expect(queued).toBeTruthy() // it got past the write gate → enqueued
    const commandId = JSON.parse(queued as string).command_id as string
    await redis.set(`res:${commandId}`, JSON.stringify({ command_id: commandId, status: 'succeeded', result: { profiles: [], total: 0 } }), { ex: 120 })
    const out = await p
    expect(out.isError).toBe(false)
  })
})

describe('enqueue → agent result → tool returns', () => {
  it('async launch returns running immediately and get_command_status reflects the posted result', async () => {
    addDevice({ id: 'd1', user_id: 'userA' })
    await markOnline('d1')

    const launched = await executeTool('userA', 'launch_profile', { profile_id: 'p1' })
    expect(launched.isError).toBe(false)
    const commandId = launched.structuredContent.command_id as string
    expect(commandId).toBeTruthy()

    // Simulate the agent: pop the command and post a result.
    const queued = await redis.rpop<string>('q:d1')
    expect(queued).toBeTruthy()
    await redis.set(`res:${commandId}`, JSON.stringify({ command_id: commandId, status: 'succeeded', result: { profile_id: 'p1', started: true } }), { ex: 120 })

    const status = await executeTool('userA', 'get_command_status', { command_id: commandId })
    expect(status.structuredContent.status).toBe('succeeded')
    expect((status.structuredContent.result as { started: boolean }).started).toBe(true)
  })
})
