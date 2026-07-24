// Smart paste parser for the proxies bulk-add UI.
//
// Accepts any of these line shapes:
//   ip:port
//   ip:port:user:pass
//   host:port
//   http://ip:port
//   https://ip:port:user:pass
//   socks5://host:port
//   socks5://host:port:user:pass
//   user:pass@ip:port  (URL-style basic auth)
//   ip:port@user:pass  (some legacy provider exports)
//
// Empty lines and lines starting with '#' are skipped.
//
// Returns one ParsedProxy per non-skipped line. Lines that can't be parsed
// produce a ParsedProxy with `error` set so the UI can show what failed.

export interface ParsedProxy {
  raw: string
  lineNumber: number
  proxy_type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username: string | null
  password: string | null
  error?: string
}

const PROTOCOLS = ['http', 'https', 'socks5'] as const

function parseLine(
  raw: string,
  lineNumber: number,
  defaultType: ParsedProxy['proxy_type']
): ParsedProxy {
  const base: ParsedProxy = {
    raw,
    lineNumber,
    proxy_type: defaultType,
    host: '',
    port: 0,
    username: null,
    password: null
  }

  const line = raw.trim()
  if (!line) return { ...base, error: 'empty' }

  // Strip optional protocol prefix (per-line prefix wins over panel default)
  let rest = line
  let proxy_type: ParsedProxy['proxy_type'] = defaultType
  for (const p of PROTOCOLS) {
    if (rest.toLowerCase().startsWith(`${p}://`)) {
      proxy_type = p
      rest = rest.slice(p.length + 3)
      break
    }
  }

  // Handle user:pass@host:port  (URL-style)
  let userPass = ''
  let hostPort = rest
  if (rest.includes('@')) {
    const at = rest.lastIndexOf('@')
    userPass = rest.slice(0, at)
    hostPort = rest.slice(at + 1)
  }

  // Now hostPort is "ip:port" OR "ip:port:user:pass" (no @ form)
  const parts = hostPort.split(':')
  let host: string
  let port: number
  let username: string | null = null
  let password: string | null = null

  if (parts.length === 2) {
    // host:port
    host = parts[0]
    port = Number(parts[1])
  } else if (parts.length === 4) {
    // host:port:user:pass
    host = parts[0]
    port = Number(parts[1])
    username = parts[2] || null
    password = parts[3] || null
  } else {
    return {
      ...base,
      proxy_type,
      error: `unexpected format (got ${parts.length} colon-separated parts)`
    }
  }

  // user:pass@host:port form overrides any colon-style trailing creds
  if (userPass) {
    const colon = userPass.indexOf(':')
    if (colon === -1) {
      username = userPass
      password = null
    } else {
      username = userPass.slice(0, colon)
      password = userPass.slice(colon + 1)
    }
  }

  if (!host) return { ...base, proxy_type, error: 'missing host' }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ...base, proxy_type, host, error: `invalid port "${parts[1] ?? ''}"` }
  }

  return {
    raw,
    lineNumber,
    proxy_type,
    host,
    port,
    username: username || null,
    password: password || null
  }
}

export function parseProxies(
  input: string,
  defaultType: ParsedProxy['proxy_type'] = 'http'
): ParsedProxy[] {
  const out: ParsedProxy[] = []
  const lines = input.split(/\r?\n/)
  lines.forEach((raw, i) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    if (trimmed.startsWith('#')) return
    out.push(parseLine(raw, i + 1, defaultType))
  })
  return out
}

// Returns the unique set of (host, port) keys — used to throttle ip2location
// lookups. Two lines pointing at the same host:port should not double-bill.
export function uniqueProxyKeys(parsed: ParsedProxy[]): string[] {
  const set = new Set<string>()
  parsed.forEach((p) => {
    if (!p.error && p.host) set.add(`${p.host}:${p.port}`)
  })
  return Array.from(set)
}
