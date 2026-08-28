// Draft model + validation for the custom-proxy connection editor.
//
// Split from ProxyConnectionEdit.tsx because react-refresh requires a
// component file to export only components (same reason batchSpec.ts is
// separate from BatchForm.tsx), and it keeps the validation unit-testable.

import type { ProxyRow, ProxyType } from '@/lib/proxies'

export interface ConnectionDraft {
  proxy_type: ProxyType
  host: string
  port: string
  username: string
  password: string
}

export function draftFromRow(p: ProxyRow): ConnectionDraft {
  return {
    proxy_type: p.proxy_type,
    host: p.host,
    port: String(p.port),
    username: p.username ?? '',
    password: p.password_encrypted ?? ''
  }
}

// Port is a string in the draft so the field can be empty mid-edit. The DB
// has a 1..65535 check constraint, so validate before offering Save rather
// than letting the write fail.
export function validateDraft(d: ConnectionDraft): string | null {
  if (!d.host.trim()) return 'Host is required.'
  if (/\s/.test(d.host.trim())) return 'Host cannot contain spaces.'
  const port = Number(d.port)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return 'Port must be a whole number between 1 and 65535.'
  }
  return null
}

export function draftDiffers(d: ConnectionDraft, p: ProxyRow): boolean {
  return (
    d.proxy_type !== p.proxy_type ||
    d.host.trim() !== p.host ||
    Number(d.port) !== p.port ||
    (d.username.trim() || null) !== (p.username || null) ||
    (d.password || null) !== (p.password_encrypted || null)
  )
}
