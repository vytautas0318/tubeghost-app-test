// proxy-test — test that a proxy works + fetch its egress IP + geo.
//
// What it does:
//   1. Validate the inputs.
//   2. Connect to ip2location.io THROUGH the user-supplied proxy.
//   3. Parse the response → egress IP + geo.
//   4. Return { ok, egress_ip, country_code, ... } or { ok: false, error }.
//
// Auth: requires a valid Supabase user JWT.
// Quota: each successful call burns one ip2location request.
//
// Why an Edge Function: IP2LOCATION_API_KEY is a server secret. The renderer
// asks Supabase to test; Supabase holds the key.
//
// Implementation: raw Deno TCP. Supabase Edge Functions run on Deno Deploy,
// where Node's `undici` ProxyAgent does NOT work (it fails instantly with
// "fetch failed"). So we tunnel manually:
//   • HTTP/HTTPS proxy → open TCP to the proxy, send an HTTP CONNECT to
//     api.ip2location.io:443, then TLS-upgrade the tunneled socket and speak
//     HTTPS over it.
//   • SOCKS5 proxy → minimal SOCKS5 handshake (greeting + optional user/pass
//     auth + CONNECT), then TLS-upgrade and speak HTTPS.

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'

const API_KEY = Deno.env.get('IP2LOCATION_API_KEY')

const TARGET_HOST = 'api.ip2location.io'
const TARGET_PORT = 443

type ProxyType = 'http' | 'https' | 'socks5'

interface TestRequest {
  proxy_type: ProxyType
  host: string
  port: number
  username?: string | null
  password?: string | null
  expected_egress_ip?: string | null
  timeout_ms?: number
}

interface TestResultOk {
  ok: true
  egress_ip: string
  country_code: string | null
  country_name: string | null
  city: string | null
  region: string | null
  timezone: string | null
  egress_matches_expected: boolean | null
  elapsed_ms: number
}

interface TestResultErr {
  ok: false
  error: string
  stage: 'validate' | 'connect' | 'auth' | 'request' | 'parse' | 'timeout'
  elapsed_ms: number
}

type TestResult = TestResultOk | TestResultErr

class StageError extends Error {
  constructor(
    public stage: TestResultErr['stage'],
    message: string
  ) {
    super(message)
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new StageError('timeout', `${label} timed out`)), ms)
    )
  ])
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: Uint8Array,
  timeoutMs: number
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  const deadline = withTimeout(
    (async () => {
      while (true) {
        const { value, done } = await reader.read()
        if (done) return
        if (value) {
          chunks.push(value)
          total += value.length
          const buf = concat(chunks, total)
          if (indexOf(buf, needle) !== -1) return
        }
      }
    })(),
    timeoutMs,
    'read'
  )
  await deadline
  return concat(chunks, total)
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

function indexOf(hay: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

const CRLFCRLF = new TextEncoder().encode('\r\n\r\n')

// Open a plain TCP connection to the proxy and CONNECT-tunnel to the target,
// returning the raw (still un-TLS'd) socket positioned to speak to the target.
async function httpConnectTunnel(req: TestRequest, timeoutMs: number): Promise<Deno.TcpConn> {
  const conn = await withTimeout(
    Deno.connect({ hostname: req.host, port: req.port }),
    timeoutMs,
    'connect'
  ).catch((e) => {
    throw e instanceof StageError ? e : new StageError('connect', String(e?.message ?? e))
  })

  const auth = req.username
    ? 'Proxy-Authorization: Basic ' +
      btoa(`${req.username}:${req.password ?? ''}`) +
      '\r\n'
    : ''
  const connectReq =
    `CONNECT ${TARGET_HOST}:${TARGET_PORT} HTTP/1.1\r\n` +
    `Host: ${TARGET_HOST}:${TARGET_PORT}\r\n` +
    auth +
    `\r\n`
  await conn.write(new TextEncoder().encode(connectReq))

  const reader = conn.readable.getReader()
  let head: Uint8Array
  try {
    head = await readUntil(reader, CRLFCRLF, timeoutMs)
  } finally {
    reader.releaseLock()
  }
  const statusLine = new TextDecoder().decode(head).split('\r\n', 1)[0] ?? ''
  const m = /^HTTP\/1\.[01]\s+(\d{3})/.exec(statusLine)
  const status = m ? Number(m[1]) : 0
  if (status === 407) throw new StageError('auth', 'proxy requires authentication (407)')
  if (status < 200 || status >= 300) {
    throw new StageError('connect', `proxy CONNECT failed: ${statusLine || 'no response'}`)
  }
  return conn
}

// Open a SOCKS5 connection to the proxy and CONNECT to the target.
async function socks5Tunnel(req: TestRequest, timeoutMs: number): Promise<Deno.TcpConn> {
  const conn = await withTimeout(
    Deno.connect({ hostname: req.host, port: req.port }),
    timeoutMs,
    'connect'
  ).catch((e) => {
    throw e instanceof StageError ? e : new StageError('connect', String(e?.message ?? e))
  })

  const reader = conn.readable.getReader()
  const readN = async (n: number): Promise<Uint8Array> => {
    const chunks: Uint8Array[] = []
    let got = 0
    await withTimeout(
      (async () => {
        while (got < n) {
          const { value, done } = await reader.read()
          if (done) throw new StageError('connect', 'proxy closed connection')
          if (value) {
            chunks.push(value)
            got += value.length
          }
        }
      })(),
      timeoutMs,
      'read'
    )
    return concat(chunks, got).slice(0, n)
  }

  try {
    const useAuth = !!req.username
    // Greeting: VER=5, methods = [no-auth] and/or [user/pass].
    await conn.write(
      new Uint8Array(useAuth ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00])
    )
    const method = await readN(2) // [VER, METHOD]
    if (method[0] !== 0x05) throw new StageError('connect', 'not a SOCKS5 proxy')
    if (method[1] === 0x02) {
      // Username/password auth (RFC 1929).
      const u = new TextEncoder().encode(req.username ?? '')
      const p = new TextEncoder().encode(req.password ?? '')
      await conn.write(new Uint8Array([0x01, u.length, ...u, p.length, ...p]))
      const authResp = await readN(2) // [VER, STATUS]
      if (authResp[1] !== 0x00) throw new StageError('auth', 'SOCKS5 auth rejected')
    } else if (method[1] !== 0x00) {
      throw new StageError('auth', 'proxy demands unsupported auth method')
    }

    // CONNECT to TARGET_HOST:TARGET_PORT as a domain name (ATYP=0x03).
    const domain = new TextEncoder().encode(TARGET_HOST)
    const portBytes = new Uint8Array([(TARGET_PORT >> 8) & 0xff, TARGET_PORT & 0xff])
    await conn.write(
      new Uint8Array([0x05, 0x01, 0x00, 0x03, domain.length, ...domain, ...portBytes])
    )
    const reply = await readN(4) // [VER, REP, RSV, ATYP]
    if (reply[1] !== 0x00) throw new StageError('connect', `SOCKS5 CONNECT failed (code ${reply[1]})`)
    // Drain the bound address so the stream is positioned at the tunnel body.
    const atyp = reply[3]
    if (atyp === 0x01) await readN(4 + 2)
    else if (atyp === 0x04) await readN(16 + 2)
    else if (atyp === 0x03) {
      const len = (await readN(1))[0]
      await readN(len + 2)
    }
  } finally {
    reader.releaseLock()
  }
  return conn
}

// Given a tunneled raw socket, TLS-upgrade to the target and make the HTTPS
// GET, returning the parsed JSON body.
async function fetchThroughTunnel(
  raw: Deno.TcpConn,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const tls = await withTimeout(
    Deno.startTls(raw, { hostname: TARGET_HOST }),
    timeoutMs,
    'tls'
  ).catch((e) => {
    throw e instanceof StageError ? e : new StageError('connect', `TLS failed: ${e?.message ?? e}`)
  })

  const path = `/?key=${encodeURIComponent(API_KEY ?? '')}&format=json`
  const httpReq =
    `GET ${path} HTTP/1.1\r\n` +
    `Host: ${TARGET_HOST}\r\n` +
    `User-Agent: TubeGhost/proxy-test\r\n` +
    `Accept: application/json\r\n` +
    `Connection: close\r\n\r\n`
  await tls.write(new TextEncoder().encode(httpReq))

  // Read the whole response (Connection: close → read to EOF).
  const reader = tls.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    await withTimeout(
      (async () => {
        while (true) {
          const { value, done } = await reader.read()
          if (done) return
          if (value) {
            chunks.push(value)
            total += value.length
          }
        }
      })(),
      timeoutMs,
      'read'
    )
  } finally {
    reader.releaseLock()
  }

  const raw2 = new TextDecoder().decode(concat(chunks, total))
  const headerEnd = raw2.indexOf('\r\n\r\n')
  if (headerEnd === -1) throw new StageError('parse', 'malformed HTTP response')
  const statusLine = raw2.slice(0, raw2.indexOf('\r\n'))
  const sm = /^HTTP\/1\.[01]\s+(\d{3})/.exec(statusLine)
  const status = sm ? Number(sm[1]) : 0
  if (status !== 200) throw new StageError('request', `ip2location returned HTTP ${status || '?'}`)

  let body = raw2.slice(headerEnd + 4)
  // De-chunk if Transfer-Encoding: chunked.
  if (/transfer-encoding:\s*chunked/i.test(raw2.slice(0, headerEnd))) {
    body = dechunk(body)
  }
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    throw new StageError('parse', 'ip2location response was not valid JSON')
  }
}

function dechunk(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const nl = s.indexOf('\r\n', i)
    if (nl === -1) break
    const size = parseInt(s.slice(i, nl).trim(), 16)
    if (!Number.isFinite(size) || size === 0) break
    out += s.slice(nl + 2, nl + 2 + size)
    i = nl + 2 + size + 2
  }
  return out
}

async function testProxy(req: TestRequest): Promise<TestResult> {
  const start = Date.now()
  const timeoutMs = Math.min(Math.max(req.timeout_ms ?? 8000, 1000), 15000)
  try {
    const tunnel =
      req.proxy_type === 'socks5'
        ? await socks5Tunnel(req, timeoutMs)
        : await httpConnectTunnel(req, timeoutMs)
    const data = await fetchThroughTunnel(tunnel, timeoutMs)

    const egress = String(data.ip ?? '')
    if (!egress) {
      return { ok: false, stage: 'parse', error: 'ip2location response missing ip', elapsed_ms: Date.now() - start }
    }
    const egressMatches =
      req.expected_egress_ip == null
        ? null
        : egress.toLowerCase() === req.expected_egress_ip.trim().toLowerCase()

    return {
      ok: true,
      egress_ip: egress,
      country_code: (data.country_code as string | undefined) ?? null,
      country_name: (data.country_name as string | undefined) ?? null,
      city: (data.city_name as string | undefined) ?? null,
      region: (data.region_name as string | undefined) ?? null,
      timezone: (data.time_zone as string | undefined) ?? null,
      egress_matches_expected: egressMatches,
      elapsed_ms: Date.now() - start
    }
  } catch (e) {
    if (e instanceof StageError) {
      return { ok: false, stage: e.stage, error: e.message, elapsed_ms: Date.now() - start }
    }
    return { ok: false, stage: 'connect', error: String((e as Error)?.message ?? e), elapsed_ms: Date.now() - start }
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (!API_KEY) {
    return jsonResponse({ error: 'IP2LOCATION_API_KEY is not configured' }, 500)
  }

  const userId = getUserIdFromRequest(req)
  if (!userId) {
    return jsonResponse({ error: 'authentication required' }, 401)
  }

  let body: TestRequest
  try {
    body = (await req.json()) as TestRequest
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  if (!body.host || typeof body.host !== 'string') {
    return jsonResponse({ error: 'host required' }, 400)
  }
  if (!body.port || body.port < 1 || body.port > 65535) {
    return jsonResponse({ error: 'invalid port' }, 400)
  }
  if (!['http', 'https', 'socks5'].includes(body.proxy_type)) {
    return jsonResponse({ error: 'invalid proxy_type' }, 400)
  }

  const result = await testProxy(body)
  return jsonResponse(result, 200)
})
