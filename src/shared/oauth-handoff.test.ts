import { describe, it, expect } from 'vitest'
import {
  B64URL_SHA256,
  buildGoogleAuthUrl,
  decodeClaims,
  resolveClaim,
  sha256Base64Url,
  timingSafeEqual,
  verifyIdTokenClaims,
  type HandoffRow
} from './oauth-handoff'

const CLIENT_ID = '1234567890-abcdef.apps.googleusercontent.com'

/** Build a handoff row as the DB would hold it. */
async function makeRow(
  verifier: string,
  overrides: Partial<HandoffRow> = {}
): Promise<HandoffRow> {
  return {
    sid: 'Zm9vYmFyYmF6cXV4MTIzNA',
    challenge: await sha256Base64Url(verifier),
    hashed_nonce: await sha256Base64Url('raw-nonce'),
    id_token: 'eyJhbGciOiJSUzI1NiJ9.payload.sig',
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    ...overrides
  }
}

/** Encode claims into the payload segment of a fake JWT. */
function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `header.${b64}.signature`
}

describe('challenge derivation', () => {
  it('produces a 43-char base64url sha256', async () => {
    const out = await sha256Base64Url('some-random-verifier')
    expect(out).toMatch(B64URL_SHA256)
    expect(out).toHaveLength(43)
  })

  it('is deterministic and differs per input', async () => {
    expect(await sha256Base64Url('a')).toBe(await sha256Base64Url('a'))
    expect(await sha256Base64Url('a')).not.toBe(await sha256Base64Url('b'))
  })

  it('matches the known SHA-256 of a fixed input', async () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(await sha256Base64Url('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')
  })
})

describe('timingSafeEqual', () => {
  it('matches identical strings and rejects differing ones', async () => {
    expect(await timingSafeEqual('abc', 'abc')).toBe(true)
    expect(await timingSafeEqual('abc', 'abd')).toBe(false)
  })

  it('rejects strings of differing length without throwing', async () => {
    expect(await timingSafeEqual('short', 'much-longer-value')).toBe(false)
    expect(await timingSafeEqual('', 'x')).toBe(false)
  })
})

describe('claim: happy path', () => {
  it('returns the id_token when the verifier matches', async () => {
    const row = await makeRow('correct-verifier')
    const res = await resolveClaim(row, 'correct-verifier', 'missing')
    expect(res).toEqual({ ok: true, id_token: row.id_token })
  })
})

describe('claim: wrong verifier', () => {
  it('rejects with invalid_verifier', async () => {
    const row = await makeRow('correct-verifier')
    const res = await resolveClaim(row, 'wrong-verifier', 'missing')
    expect(res).toEqual({ ok: false, error: 'invalid_verifier', status: 403 })
  })

  it('does not leak the token on rejection', async () => {
    const row = await makeRow('correct-verifier')
    const res = await resolveClaim(row, 'wrong-verifier', 'missing')
    expect(JSON.stringify(res)).not.toContain(row.id_token as string)
  })
})

describe('claim: double claim', () => {
  // The second claim's atomic delete matches nothing (the first consumed the
  // row) and no residual row is found.
  it('returns already_claimed the second time', async () => {
    const row = await makeRow('v')
    const first = await resolveClaim(row, 'v', 'missing')
    expect(first.ok).toBe(true)

    const second = await resolveClaim(null, 'v', 'missing')
    expect(second).toEqual({ ok: false, error: 'already_claimed', status: 400 })
  })
})

describe('claim: unknown sid', () => {
  it('is indistinguishable from an already-claimed sid', async () => {
    const res = await resolveClaim(null, 'whatever', 'missing')
    expect(res).toEqual({ ok: false, error: 'already_claimed', status: 400 })
  })
})

describe('claim: expired handoff', () => {
  it('returns expired when the residual row is past its window', async () => {
    const res = await resolveClaim(null, 'v', 'expired')
    expect(res).toEqual({ ok: false, error: 'expired', status: 400 })
  })
})

describe('claim: browser half still in flight', () => {
  it('returns invalid_state (retryable) when the row has no id_token yet', async () => {
    const res = await resolveClaim(null, 'v', 'pending')
    expect(res).toEqual({ ok: false, error: 'invalid_state', status: 409 })
  })
})

describe('id_token verification', () => {
  const base = async (): Promise<Record<string, unknown>> => ({
    aud: CLIENT_ID,
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    nonce: await sha256Base64Url('raw-nonce')
  })

  it('accepts a well-formed token bound to this flow', async () => {
    const claims = await base()
    const ok = await verifyIdTokenClaims(claims, {
      clientId: CLIENT_ID,
      hashedNonce: await sha256Base64Url('raw-nonce')
    })
    expect(ok).toBe(true)
  })

  it('rejects a nonce mismatch (token replayed from another flow)', async () => {
    const claims = { ...(await base()), nonce: await sha256Base64Url('different-nonce') }
    const ok = await verifyIdTokenClaims(claims, {
      clientId: CLIENT_ID,
      hashedNonce: await sha256Base64Url('raw-nonce')
    })
    expect(ok).toBe(false)
  })

  it('rejects a missing nonce', async () => {
    const claims = await base()
    delete claims.nonce
    const ok = await verifyIdTokenClaims(claims, {
      clientId: CLIENT_ID,
      hashedNonce: await sha256Base64Url('raw-nonce')
    })
    expect(ok).toBe(false)
  })

  it('rejects a token minted for a different client', async () => {
    const claims = { ...(await base()), aud: 'someone-else.apps.googleusercontent.com' }
    const ok = await verifyIdTokenClaims(claims, {
      clientId: CLIENT_ID,
      hashedNonce: await sha256Base64Url('raw-nonce')
    })
    expect(ok).toBe(false)
  })

  it('rejects a foreign issuer', async () => {
    const claims = { ...(await base()), iss: 'https://evil.example.com' }
    const ok = await verifyIdTokenClaims(claims, {
      clientId: CLIENT_ID,
      hashedNonce: await sha256Base64Url('raw-nonce')
    })
    expect(ok).toBe(false)
  })

  it('accepts both Google issuer spellings', async () => {
    for (const iss of ['accounts.google.com', 'https://accounts.google.com']) {
      const claims = { ...(await base()), iss }
      const ok = await verifyIdTokenClaims(claims, {
        clientId: CLIENT_ID,
        hashedNonce: await sha256Base64Url('raw-nonce')
      })
      expect(ok, iss).toBe(true)
    }
  })

  it('rejects an expired token', async () => {
    const claims = { ...(await base()), exp: Math.floor(Date.now() / 1000) - 10 }
    const ok = await verifyIdTokenClaims(claims, {
      clientId: CLIENT_ID,
      hashedNonce: await sha256Base64Url('raw-nonce')
    })
    expect(ok).toBe(false)
  })

  it('rejects a null / undecodable payload', async () => {
    const ok = await verifyIdTokenClaims(null, {
      clientId: CLIENT_ID,
      hashedNonce: await sha256Base64Url('raw-nonce')
    })
    expect(ok).toBe(false)
  })
})

describe('decodeClaims', () => {
  it('round-trips a payload', () => {
    expect(decodeClaims(fakeJwt({ aud: 'x', exp: 1 }))).toEqual({ aud: 'x', exp: 1 })
  })

  it('returns null for malformed input', () => {
    expect(decodeClaims('not-a-jwt')).toBeNull()
    expect(decodeClaims('a.b')).toBeNull()
    expect(decodeClaims('a.!!!not-base64!!!.c')).toBeNull()
  })
})

describe('buildGoogleAuthUrl', () => {
  it('carries every parameter the contract specifies', () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: CLIENT_ID,
        redirectUri: 'https://proj.supabase.co/functions/v1/oauth-google-callback',
        sid: 'sid-123',
        hashedNonce: 'hashed-nonce-value'
      })
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('state')).toBe('sid-123')
    expect(url.searchParams.get('access_type')).toBe('online')
    expect(url.searchParams.get('prompt')).toBe('select_account')
  })

  it('sends the HASHED nonce, never a raw one', () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: CLIENT_ID,
        redirectUri: 'https://example.com/cb',
        sid: 's',
        hashedNonce: 'hashed-nonce-value'
      })
    )
    expect(url.searchParams.get('nonce')).toBe('hashed-nonce-value')
  })
})
