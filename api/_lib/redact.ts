// Strip secret-bearing fields from tool args before they hit command_log.
//
// The contract's input schemas already avoid credentials (proxies are referenced
// by id, never host/user/pass), but this is defense in depth: if a future tool
// or a malformed arg carries a secret-looking key, it never reaches the audit
// table. Also caps size so a giant bulk_import payload doesn't bloat the log.

const SECRET_KEYS = /pass|password|secret|token|cookie|credential|api[_-]?key|authorization|proxy_(user|pass|host|port)/i

export function redactArgs(args: unknown): Record<string, unknown> {
  const seen = new WeakSet<object>()
  function walk(v: unknown, depth: number): unknown {
    if (depth > 6) return '[deep]'
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'string' && v.length > 500) return v.slice(0, 500) + '…'
      return v
    }
    if (seen.has(v)) return '[circular]'
    seen.add(v)
    if (Array.isArray(v)) return v.slice(0, 100).map((x) => walk(x, depth + 1))
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : walk(val, depth + 1)
    }
    return out
  }
  const result = walk(args, 0)
  return result && typeof result === 'object' && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : { value: result }
}
