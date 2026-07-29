// Cold-start survival test for the OAuth consent data endpoint.
//
// The pending authorization request MUST live in shared storage (Redis), not
// module memory — serverless invocations don't share memory. We simulate a
// "different process" by resetting the module registry between storing the
// request and resolving it, and assert the approve endpoint still finds the rid.

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FakeRedis } from './fake-redis.js'

// A SINGLE shared FakeRedis instance that persists across module resets — this
// stands in for Upstash, which is external and survives cold starts.
const redis = new FakeRedis()
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() { return redis } } }))
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow(): object {
      return {}
    }
    async limit(): Promise<{ success: boolean }> {
      return { success: true }
    }
  },
}))

// Session verification → always the same user (the consent endpoint is session-
// authed; we're testing rid resolution, not auth).
vi.mock('../session.js', () => ({
  requireSession: vi.fn(async () => ({ userId: 'user-1', email: 'u@x.com' })),
}))
// No devices needed for the GET details shape.
vi.mock('../db.js', () => ({ listDevices: vi.fn(async () => []) }))

beforeAll(() => {
  process.env.PUBLIC_BASE_URL = 'https://app.tubeghost.com'
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
  process.env.SUPABASE_ANON_KEY = 'anon'
  process.env.UPSTASH_REDIS_REST_URL = 'https://r'
  process.env.UPSTASH_REDIS_REST_TOKEN = 't'
  process.env.OAUTH_JWT_SECRET = 'secret'
})
beforeEach(() => redis.clear())

function mkRes(): { state: { status: number; body: unknown }; res: VercelResponse } {
  const state = { status: 0, body: undefined as unknown }
  const res = {
    setHeader: () => res,
    status(s: number) {
      state.status = s
      return res
    },
    json(b: unknown) {
      state.body = b
      return res
    },
  } as unknown as VercelResponse
  return { state, res }
}

describe('consent endpoint survives a cold start', () => {
  it('resolves a rid stored by a "previous process" (module registry reset)', async () => {
    // Process A: register a client + stash the pending authorization request.
    const storeA = await import('../oauth-store.js')
    await storeA.putClient({
      client_id: 'c1',
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/cb'],
      token_endpoint_auth_method: 'none',
      created_at: 1,
    })
    await storeA.putRequest({
      rid: 'RID-with_base64url-chars',
      client_id: 'c1',
      redirect_uri: 'https://claude.ai/cb',
      state: 'xyz',
      scope: 'mcp',
      code_challenge: 'chal',
      code_challenge_method: 'S256',
      resource: 'https://app.tubeghost.com/api/mcp',
    })

    // Simulate a cold start: blow away the module registry so the handler is a
    // freshly-imported module with no in-memory state (only Redis persists).
    vi.resetModules()

    // Process B: the consent GET must still resolve the rid from Redis.
    const { default: approve } = await import('../handlers/oauth/approve.js')
    const { state, res } = mkRes()
    const req = {
      method: 'GET',
      headers: { authorization: 'Bearer session-token' },
      query: { rid: 'RID-with_base64url-chars' },
    } as unknown as VercelRequest
    await approve(req, res)

    expect(state.status).toBe(200)
    expect((state.body as { clientName: string; scopes: string[] }).clientName).toBe('Claude')
    expect((state.body as { scopes: string[] }).scopes).toEqual(['mcp'])
  })

  it('a rid that was never stored → 400 request_expired (not a 500/HTML)', async () => {
    const { default: approve } = await import('../handlers/oauth/approve.js')
    const { state, res } = mkRes()
    const req = {
      method: 'GET',
      headers: { authorization: 'Bearer session-token' },
      query: { rid: 'does-not-exist' },
    } as unknown as VercelRequest
    await approve(req, res)
    expect(state.status).toBe(400)
    expect((state.body as { error: string }).error).toBe('request_expired')
  })
})
