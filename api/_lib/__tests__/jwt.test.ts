import { describe, it, expect, beforeAll } from 'vitest'

// env.ts reads these at import time; set them before importing jwt.ts.
beforeAll(() => {
  process.env.PUBLIC_BASE_URL = 'https://app.tubeghost.com'
  process.env.OAUTH_JWT_SECRET = 'test-secret-please-change'
})

describe('access token sign/verify', () => {
  it('round-trips a valid token', async () => {
    const { signAccessToken, verifyAccessToken } = await import('../jwt.js')
    const { token } = signAccessToken('user-1', 'mcp')
    const claims = verifyAccessToken(token)
    expect(claims?.sub).toBe('user-1')
    expect(claims?.aud).toBe('https://app.tubeghost.com/api/mcp')
    expect(claims?.typ).toBe('mcp_access')
  })

  it('rejects a tampered signature', async () => {
    const { signAccessToken, verifyAccessToken } = await import('../jwt.js')
    const { token } = signAccessToken('user-1', 'mcp')
    const [h, b] = token.split('.')
    expect(verifyAccessToken(`${h}.${b}.deadbeef`)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const { verifyAccessToken } = await import('../jwt.js')
    const { createHmac } = await import('node:crypto')
    const now = Math.floor(Date.now() / 1000)
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(
      JSON.stringify({
        sub: 'u',
        scope: 'mcp',
        aud: 'https://app.tubeghost.com/api/mcp',
        iss: 'https://app.tubeghost.com',
        iat: now - 7200,
        exp: now - 3600,
        typ: 'mcp_access',
      }),
    ).toString('base64url')
    const sig = createHmac('sha256', 'test-secret-please-change').update(`${head}.${body}`).digest('base64url')
    expect(verifyAccessToken(`${head}.${body}.${sig}`)).toBeNull()
  })

  it('AUDIENCE CONFUSION: rejects a token whose aud is the apex, not /api/mcp', async () => {
    const { verifyAccessToken } = await import('../jwt.js')
    const { createHmac } = await import('node:crypto')
    const now = Math.floor(Date.now() / 1000)
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(
      JSON.stringify({
        sub: 'u',
        scope: 'mcp',
        aud: 'https://app.tubeghost.com', // apex — NOT an accepted alias
        iss: 'https://app.tubeghost.com',
        iat: now,
        exp: now + 3600,
        typ: 'mcp_access',
      }),
    ).toString('base64url')
    const sig = createHmac('sha256', 'test-secret-please-change').update(`${head}.${body}`).digest('base64url')
    expect(verifyAccessToken(`${head}.${body}.${sig}`)).toBeNull()
  })
})
