// ip:port:username:password lines — the shared Copy/Export format, used by
// both the TubeProxies toolbar (whole table) and the bulk-action bar
// (selection) so the two produce byte-identical output.

import type { ViewProxy } from './types'

export function toLines(rows: ViewProxy[]): string {
  return rows
    .map((p) => `${p.host}:${p.port}:${p.username ?? ''}:${p.password_encrypted ?? ''}`)
    .join('\n')
}
