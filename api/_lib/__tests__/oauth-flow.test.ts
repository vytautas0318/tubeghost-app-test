import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { createHash } from 'node:crypto'
import { FakeRedis } from './fake-redis.js'

const redis = new FakeRedis()
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() { return redis } } }))
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

beforeAll(() => {
  process.env.PUBLIC_BASE_URL = 'https://app.tubeghost.com'
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
  process.env.SUPABASE_ANON_KEY = 'anon'
  process.env.UPSTASH_REDIS_REST_URL = 'https://r'
  process.env.UPSTASH_REDIS_REST_TOKEN = 't'
  process.env.OAUTH_JWT_SECRET = 'secret'
})

// Minimal Vercel req/res doubles. `res` mutates the returned capture in place.
interface Capture {
  status: number
  body: unknown
  res: import('@vercel/node').VercelResponse
}
function mkRes(): Capture {
  const cap = { status: 0, body: undefined as unknown } as Capture
  const res = {
    setHeader() {
      return res
    },
    redirect() {
      return res
    },
    status(s: number) {
      cap.status = s
      return res
    },
    json(b: unknown) {
      cap.body = b
      return res
    },
    send(b: unknown) {
      cap.body = b
      return res
    },
  } as unknown as import('@vercel/node').VercelResponse
  cap.res = res
  return cap
}
function mkReq(body: Record<string, string>): import('@vercel/node').VercelRequest {
  return { method: 'POST', headers: {}, body, query: {} } as unknown as import('@vercel/node').VercelRequest
}

beforeEach(() => redis.clear())

const b64url = (b: Buffer): string => b.toString('base64url')
const challengeFor = (verifier: string): string => b64url(createHash('sha256').update(verifier).digest())

describe('authorization_code + PKCE', () => {
  it('MISSING PKCE: authorize rejects a request without code_challenge', async () => {
    const { default: authorize } = await import('../handlers/oauth/authorize.js')
    // Register a client + redirect first.
    const { putClient } = await import('../oauth-store.js')
    await putClient({
      client_id: 'c1',
      redirect_uris: ['https://claude.ai/cb'],
      token_endpoint_auth_method: 'none',
      created_at: Date.now(),
    })
    const cap = mkRes()
    const req = {
      method: 'GET',
      headers: {},
      query: { client_id: 'c1', redirect_uri: 'https://claude.ai/cb', response_type: 'code' },
    } as unknown as import('@vercel/node').VercelRequest
    // authorize redirects on protocol errors (missing PKCE) back to the client.
    let redirected = ''
    ;(cap.res as unknown as { redirect: (c: number, u: string) => void }).redirect = (_c, u) => {
      redirected = u
    }
    await authorize(req, cap.res)
    expect(redirected).toContain('error=invalid_request')
  })

  it('exchanges a code with the right verifier and rejects a wrong one', async () => {
    const { putCode } = await import('../oauth-store.js')
    const { default: token } = await import('../handlers/oauth/token.js')
    const verifier = 'the-real-verifier-string-1234567890'
    await putCode({
      code: 'code123',
      client_id: 'c1',
      user_id: 'user-1',
      redirect_uri: 'https://claude.ai/cb',
      scope: 'mcp',
      code_challenge: challengeFor(verifier),
      resource: null,
    })

    // Wrong verifier → invalid_grant, and the code is consumed (single-use).
    const bad = mkRes()
    await token(
      mkReq({ grant_type: 'authorization_code', code: 'code123', code_verifier: 'wrong', client_id: 'c1', redirect_uri: 'https://claude.ai/cb' }),
      bad.res,
    )
    expect(bad.status).toBe(400)

    // Re-issue a fresh code for the success path (previous was consumed).
    await putCode({
      code: 'code456',
      client_id: 'c1',
      user_id: 'user-1',
      redirect_uri: 'https://claude.ai/cb',
      scope: 'mcp',
      code_challenge: challengeFor(verifier),
      resource: null,
    })
    const ok = mkRes()
    await token(
      mkReq({ grant_type: 'authorization_code', code: 'code456', code_verifier: verifier, client_id: 'c1', redirect_uri: 'https://claude.ai/cb' }),
      ok.res,
    )
    expect(ok.status).toBe(200)
    expect((ok.body as { access_token: string }).access_token).toBeTruthy()
    expect((ok.body as { refresh_token: string }).refresh_token).toContain('.')
  })

  it('a consumed code cannot be replayed', async () => {
    const { putCode } = await import('../oauth-store.js')
    const { default: token } = await import('../handlers/oauth/token.js')
    const verifier = 'v'.repeat(40)
    await putCode({
      code: 'once',
      client_id: 'c1',
      user_id: 'u',
      redirect_uri: 'https://claude.ai/cb',
      scope: 'mcp',
      code_challenge: challengeFor(verifier),
      resource: null,
    })
    const first = mkRes()
    await token(mkReq({ grant_type: 'authorization_code', code: 'once', code_verifier: verifier, client_id: 'c1', redirect_uri: 'https://claude.ai/cb' }), first.res)
    expect(first.status).toBe(200)
    const second = mkRes()
    await token(mkReq({ grant_type: 'authorization_code', code: 'once', code_verifier: verifier, client_id: 'c1', redirect_uri: 'https://claude.ai/cb' }), second.res)
    expect(second.status).toBe(400)
  })
})

describe('refresh rotation + reuse-revokes-chain', () => {
  async function mintInitial(): Promise<string> {
    const { putCode } = await import('../oauth-store.js')
    const { default: token } = await import('../handlers/oauth/token.js')
    const verifier = 'r'.repeat(40)
    await putCode({ code: 'rc', client_id: 'c1', user_id: 'u', redirect_uri: 'https://claude.ai/cb', scope: 'mcp', code_challenge: challengeFor(verifier), resource: null })
    const cap = mkRes()
    await token(mkReq({ grant_type: 'authorization_code', code: 'rc', code_verifier: verifier, client_id: 'c1', redirect_uri: 'https://claude.ai/cb' }), cap.res)
    return (cap.body as { refresh_token: string }).refresh_token
  }

  it('rotates: old refresh token stops working, new one works', async () => {
    const { default: token } = await import('../handlers/oauth/token.js')
    const rt1 = await mintInitial()

    const r1 = mkRes()
    await token(mkReq({ grant_type: 'refresh_token', refresh_token: rt1 }), r1.res)
    expect(r1.status).toBe(200)
    const rt2 = (r1.body as { refresh_token: string }).refresh_token
    expect(rt2).not.toBe(rt1)

    // rt2 works.
    const r2 = mkRes()
    await token(mkReq({ grant_type: 'refresh_token', refresh_token: rt2 }), r2.res)
    expect(r2.status).toBe(200)
  })

  it('REPLAY of a rotated token revokes the whole chain', async () => {
    const { default: token } = await import('../handlers/oauth/token.js')
    const rt1 = await mintInitial()

    const r1 = mkRes()
    await token(mkReq({ grant_type: 'refresh_token', refresh_token: rt1 }), r1.res)
    const rt2 = (r1.body as { refresh_token: string }).refresh_token

    // Replay rt1 (already rotated) → reuse detected → chain revoked.
    const replay = mkRes()
    await token(mkReq({ grant_type: 'refresh_token', refresh_token: rt1 }), replay.res)
    expect(replay.status).toBe(400)
    expect((replay.body as { error_description?: string }).error_description).toMatch(/reuse/i)

    // Now even the previously-valid rt2 is dead (chain nuked).
    const after = mkRes()
    await token(mkReq({ grant_type: 'refresh_token', refresh_token: rt2 }), after.res)
    expect(after.status).toBe(400)
  })
})
