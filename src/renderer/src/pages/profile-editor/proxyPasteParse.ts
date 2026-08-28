// Parse ONE pasted proxy line into the editor's field state.
//
// Split from ProxyPasteRow.tsx so it's unit-testable (and because react-refresh
// wants component-only files). Delegates the actual format handling to
// lib/proxies-parser, the same parser the Proxies page's bulk "Add proxies"
// panel uses — a line that works in one must work in the other.

import { parseProxies } from '@tubeghost/ui'
import type { ProxyFieldsState } from './ProxyCardFields'

export type PasteResult =
  | { ok: true; fields: ProxyFieldsState }
  | { ok: false; error: string }
  | { ok: 'empty' }

export function parsePastedProxy(raw: string, defaultType: ProxyFieldsState['type']): PasteResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: 'empty' }

  // Blank lines and # comments are skipped, as in the bulk parser, so a copied
  // block with trailing newlines still counts as a single proxy.
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))

  if (lines.length === 0) return { ok: 'empty' }
  if (lines.length > 1) {
    return {
      ok: false,
      error: 'One proxy at a time here — use Proxies → Add custom proxy for a bulk paste.'
    }
  }

  const [parsed] = parseProxies(lines[0], defaultType)
  if (!parsed || parsed.error) {
    return {
      ok: false,
      error: parsed?.error ? `Could not parse: ${parsed.error}` : 'Could not parse that line.'
    }
  }

  return {
    ok: true,
    fields: {
      type: parsed.proxy_type,
      host: parsed.host,
      port: String(parsed.port),
      user: parsed.username ?? '',
      pass: parsed.password ?? ''
    }
  }
}
