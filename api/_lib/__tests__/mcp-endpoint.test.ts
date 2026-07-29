import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('@upstash/redis', () => ({ Redis: class { constructor() { return {} } } }))
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

beforeAll(() => {
  process.env.PUBLIC_BASE_URL = 'https://app.tubeghost.com'
  process.env.OAUTH_JWT_SECRET = 'secret'
  process.env.SUPABASE_URL = 'u'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
  process.env.SUPABASE_ANON_KEY = 'a'
  process.env.UPSTASH_REDIS_REST_URL = 'r'
  process.env.UPSTASH_REDIS_REST_TOKEN = 't'
})

interface ResState {
  status: number
  body: unknown
  headers: Record<string, string>
  headersSent: boolean
}
function makeRes(): { state: ResState; res: VercelResponse } {
  const state: ResState = { status: 0, body: undefined, headers: {}, headersSent: false }
  const res = {
    setHeader(k: string, v: string) {
      state.headers[k.toLowerCase()] = v
      return res
    },
    status(s: number) {
      state.status = s
      return res
    },
    json(b: unknown) {
      state.body = b
      state.headersSent = true
      return res
    },
    end() {
      state.headersSent = true
      return res
    },
    on() {
      return res
    },
  } as unknown as VercelResponse
  return { state, res }
}
function mkReq(body: unknown, headers: Record<string, string> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://claude.ai', ...headers },
    body,
  } as unknown as VercelRequest
}

describe('/api/mcp endpoint', () => {
  it('401 without a bearer token', async () => {
    const mod = await import('../../mcp/index.js')
    const { state, res } = makeRes()
    await mod.default(mkReq({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), res)
    expect(state.status).toBe(401)
    expect(state.headers['www-authenticate']).toContain('resource_metadata')
  })

  it('authenticated tools/list returns the 16 tools as JSON-RPC', async () => {
    const { signAccessToken } = await import('../jwt.js')
    const { token } = signAccessToken('user-1', 'mcp')
    const mod = await import('../../mcp/index.js')
    const { state, res } = makeRes()
    await mod.default(mkReq({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authorization: `Bearer ${token}` }), res)
    expect(state.status).toBe(200)
    expect((state.body as { result: { tools: unknown[] } }).result.tools.length).toBe(16)
  })

  it('initialize returns serverInfo', async () => {
    const { signAccessToken } = await import('../jwt.js')
    const { token } = signAccessToken('user-1', 'mcp')
    const mod = await import('../../mcp/index.js')
    const { state, res } = makeRes()
    await mod.default(
      mkReq(
        {
          jsonrpc: '2.0',
          id: 9,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
        },
        { authorization: `Bearer ${token}` },
      ),
      res,
    )
    expect(state.status).toBe(200)
    expect((state.body as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe('tubeghost')
  })
})
