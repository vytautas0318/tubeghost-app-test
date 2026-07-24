// proxy-test — test that a proxy works + fetch its egress IP + geo.
//
// What it does, in order:
//   1. Validate the inputs.
//   2. Make an HTTPS request to ip2location.io THROUGH the user-supplied proxy.
//   3. Parse the response → egress IP + geo.
//   4. Return { ok, egress_ip, country_code, ... } or { ok: false, error }.
//
// Auth: requires a valid Supabase user JWT.
// Quota: each call burns one ip2location request.
//
// Why an Edge Function: IP2LOCATION_API_KEY is a server secret. The renderer
// asks Supabase to test; Supabase holds the key.
//
// Implementation: undici's ProxyAgent supports HTTP/HTTPS proxies. For SOCKS5
// we use socks-proxy-agent. Both compose with the standard Web fetch API.

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUserIdFromRequest } from '../_shared/auth.ts'
import { ProxyAgent, fetch as undiciFetch } from 'npm:undici@7.10.0'
import { SocksProxyAgent } from 'npm:socks-proxy-agent@8.0.5'

const API_KEY = Deno.env.get('IP2LOCATION_API_KEY')

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

function buildProxyUrl(req: TestRequest): string {
  const scheme = req.proxy_type === 'socks5' ? 'socks5' : req.proxy_type
  const auth =
    req.username
      ? `${encodeURIComponent(req.username)}:${encodeURIComponent(req.password ?? '')}@`
      : ''
  return `${scheme}://${auth}${req.host}:${req.port}`
}

async function testProxy(req: TestRequest): Promise<TestResult> {
  const start = Date.now()
  const proxyUrl = buildProxyUrl(req)
  const timeoutMs = req.timeout_ms ?? 8000
  const target = `https://api.ip2location.io/?key=${encodeURIComponent(API_KEY ?? '')}&format=json`

  try {
    let response: Response
    if (req.proxy_type === 'socks5') {
      // SOCKS5 path uses socks-proxy-agent; pass to undici via a custom
      // Dispatcher. socks-proxy-agent is a Node http.Agent — undici accepts
      // it through its `dispatcher` option only via ProxyAgent for HTTP, so
      // for SOCKS we use the global `fetch` polyfill that respects the agent.
      // Workaround: use ProxyAgent with `socks5://` scheme is NOT supported
      // by undici; we must fall back to constructing the request manually.
      //
      // Simplest portable path: spawn a connect() through SOCKS using the
      // `socks` package, then pipe the TLS request manually. But that's
      // brittle. Instead, we rely on socks-proxy-agent + Node's native https.
      //
      // In Deno Edge runtime, there is no Node http module. So for v1 we
      // route SOCKS5 via the HTTP API (port 80) of ip2location, which still
      // returns the full record. The HTTPS endpoint has the same data.

      const r = await fetchOverSocks5(target.replace('https://', 'http://'), req, timeoutMs)
      response = r
    } else {
      const agent = new ProxyAgent(proxyUrl)
      response = (await undiciFetch(target, {
        dispatcher: agent,
        signal: AbortSignal.timeout(timeoutMs)
      })) as unknown as Response
    }

    if (!response.ok) {
      const stage: TestResult['stage'] = response.status === 407 ? 'auth' : 'request'
      return {
        ok: false,
        stage,
        error: `proxy returned HTTP ${response.status}`,
        elapsed_ms: Date.now() - start
      }
    }

    const data = (await response.json()) as Record<string, unknown>
    const egress = String(data.ip ?? '')
    if (!egress) {
      return {
        ok: false,
        stage: 'parse',
        error: 'ip2location response missing ip field',
        elapsed_ms: Date.now() - start
      }
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
    const msg = e instanceof Error ? e.message : String(e)
    let stage: TestResult['stage'] = 'connect'
    if (/abort|timeout/i.test(msg)) stage = 'timeout'
    else if (/auth|407/i.test(msg)) stage = 'auth'
    return { ok: false, stage, error: msg, elapsed_ms: Date.now() - start }
  }
}

async function fetchOverSocks5(
  url: string,
  req: TestRequest,
  timeoutMs: number
): Promise<Response> {
  const proxyUrl = buildProxyUrl({ ...req, proxy_type: 'socks5' })
  const agent = new SocksProxyAgent(proxyUrl)
  // undici can use a Node http.Agent via its `dispatcher` only if wrapped.
  // Simpler: use the global Deno fetch with a custom Client. Since undici's
  // ProxyAgent doesn't support socks scheme, we use SocksProxyAgent through
  // its built-in connect() method to dial the host and then do plain HTTP.
  const u = new URL(url)
  const port = Number(u.port || 80)
  const socket = (await agent.connect({
    host: u.hostname,
    port,
    timeout: timeoutMs
  } as never)) as unknown as {
    write: (s: string) => void
    on: (event: string, cb: (d?: unknown) => void) => void
    destroy: () => void
  }

  const path = u.pathname + u.search
  const httpReq =
    `GET ${path} HTTP/1.1\r\n` +
    `Host: ${u.hostname}\r\n` +
    `Connection: close\r\n` +
    `User-Agent: TubeProxiesBrowser/proxy-test\r\n\r\n`
  socket.write(httpReq)

  const buf: string[] = []
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      socket.destroy()
      reject(new Error('socks read timeout'))
    }, timeoutMs)
    socket.on('data', (d) => {
      buf.push(new TextDecoder().decode(d as Uint8Array))
    })
    socket.on('end', () => {
      clearTimeout(t)
      resolve()
    })
    socket.on('error', (e) => {
      clearTimeout(t)
      reject(e instanceof Error ? e : new Error(String(e)))
    })
  })

  const raw = buf.join('')
  return parseRawHttpToResponse(raw)
}

// Convert a raw HTTP/1.1 response string to a Response object.
function parseRawHttpToResponse(raw: string): Response {
  const headerEnd = raw.indexOf('\r\n\r\n')
  if (headerEnd === -1) {
    return new Response('malformed response', { status: 502 })
  }
  const head = raw.slice(0, headerEnd)
  const statusLine = head.split('\r\n', 1)[0] ?? ''
  const statusMatch = /^HTTP\/1\.[01] (\d{3})/.exec(statusLine)
  const status = statusMatch ? Number(statusMatch[1]) : 502

  let body = raw.slice(headerEnd + 4)
  // De-chunk if chunked. Naive: strip leading hex line + trailing 0-marker.
  const firstLineEnd = body.indexOf('\r\n')
  if (firstLineEnd !== -1 && /^[0-9a-fA-F]+$/.test(body.slice(0, firstLineEnd))) {
    body = body.slice(firstLineEnd + 2)
    const trailingZero = body.lastIndexOf('\r\n0\r\n')
    if (trailingZero !== -1) body = body.slice(0, trailingZero)
  }

  return new Response(body.trim(), { status })
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
  // Always 200 — the body's `ok` field carries the real status.
  return jsonResponse(result, 200)
})
