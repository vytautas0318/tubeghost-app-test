// Paste-a-proxy-line shortcut for the profile editor's "Custom inline" tab.
//
// Mirrors the Proxies page's "Add proxies" panel — same accepted formats, same
// parser (lib/proxies-parser), so a line that works in one works in the other.
// The difference is scope: that panel bulk-adds to the workspace, this sets the
// ONE proxy on ONE profile, so a multi-line paste is refused rather than
// silently using the first line and discarding the rest.
//
// Parsing fills the Host/Port/Username/Password fields below rather than
// replacing them: the fast path for the common case, with the fields still
// there to correct a single character without re-pasting.

import * as React from 'react'
import { useState } from 'react'
import { ClipboardPaste } from 'lucide-react'
import { parsePastedProxy } from './proxyPasteParse'
import type { ProxyFieldsState } from './ProxyCardFields'

const PLACEHOLDER = `Paste a proxy line, e.g.
198.51.100.42:8080:user:pass
socks5://198.51.100.42:1080:user:pass`

export function ProxyPasteRow({
  disabled,
  defaultType,
  onParsed
}: {
  disabled: boolean
  // Used for lines that carry no explicit scheme:// prefix, matching the
  // Add proxies panel's DEFAULT PROTOCOL control.
  defaultType: ProxyFieldsState['type']
  onParsed: (fields: Omit<ProxyFieldsState, 'type'> & { type: ProxyFieldsState['type'] }) => void
}): React.ReactElement {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  // What the last successful paste resolved to, echoed back so a paste that
  // worked LOOKS like it worked. Clearing the box on success (the first cut of
  // this) read as "nothing happened" -- the fields below had filled in, but the
  // box the user was looking at went empty.
  const [applied, setApplied] = useState<string | null>(null)

  const apply = (raw: string): void => {
    setText(raw)
    setError(null)
    setApplied(null)
    const res = parsePastedProxy(raw, defaultType)
    if (res.ok === 'empty') return
    if (!res.ok) {
      setError(res.error)
      return
    }
    onParsed(res.fields)
    // Echo the PARSED result rather than the raw line: it confirms how the line
    // was interpreted (which matters when a scheme:// overrode the Type
    // buttons) and it names the user without repeating the password.
    const { type, host, port, user } = res.fields
    setApplied(`${type.toUpperCase()} · ${host}:${port}${user ? ` · auth as ${user}` : ''}`)
  }

  return (
    <div className="mb-3">
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--t3)] mb-1">
        Paste a proxy
      </label>
      <div className="relative">
        <ClipboardPaste className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--t4)]" />
        <textarea
          value={text}
          disabled={disabled}
          spellCheck={false}
          rows={3}
          placeholder={PLACEHOLDER}
          onChange={(e) => apply(e.target.value)}
          className="w-full pl-8 pr-2.5 py-1.5 text-sm font-mono bg-[var(--panel-2)] border border-[var(--line)] rounded-md text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--red)]/30 resize-none disabled:opacity-50"
        />
      </div>
      {error ? (
        <p className="mt-1 text-[11px] text-[var(--red)]">{error}</p>
      ) : applied ? (
        <p className="mt-1 text-[11px] text-[var(--green)]">✓ Applied · {applied}</p>
      ) : (
        <p className="mt-1 text-[11px] text-[var(--t3)]">
          ip:port · ip:port:user:pass · user:pass@ip:port · scheme:// prefixes all work. Fills the
          fields below.
        </p>
      )}
    </div>
  )
}
