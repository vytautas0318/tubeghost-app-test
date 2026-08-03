// Password cell for the TubeProxies tab.
//
// The password is already present in the loaded proxy row (`password_encrypted`,
// stored as-is — Vault was never wired), so the eye toggles it in place with NO
// network call, mirroring ProxyDetailDrawer. A copy button sits next to the eye
// (same as the drawer's Connection section).
//
// Rules: reveal for ~10s then auto-mask; clear on unmount so no plaintext
// lingers. Both icons stay pinned/visible on narrow widths — only the value
// truncates (min-width:0 on the cell, flex-shrink:0 on the buttons via .pw-eye).

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'

const REVEAL_MS = 10_000
const COPIED_MS = 1200

export function RevealPassword({ password }: { password: string | null }): React.ReactElement {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = (): void => {
    if (revealTimer.current) clearTimeout(revealTimer.current)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    revealTimer.current = null
    copyTimer.current = null
  }

  // Don't leave it revealed / with dangling timers after the row unmounts.
  useEffect(() => {
    return () => {
      clearTimers()
      setShown(false)
    }
  }, [])

  // No password on this row (custom proxy without one, or not synced yet).
  if (!password) {
    return <span className="pw-val">—</span>
  }

  const toggle = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (revealTimer.current) clearTimeout(revealTimer.current)
    setShown((prev) => {
      const next = !prev
      if (next) revealTimer.current = setTimeout(() => setShown(false), REVEAL_MS)
      return next
    })
  }

  const copy = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void navigator.clipboard.writeText(password).then(() => {
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
    })
  }

  return (
    <span className="pw-cell" onClick={(e) => e.stopPropagation()}>
      <span className="pw-val">{shown ? password : '••••••••'}</span>
      <button
        type="button"
        className="pw-eye"
        onClick={toggle}
        title={shown ? 'Hide password' : 'Reveal password'}
        aria-label={shown ? 'Hide password' : 'Reveal password'}
      >
        {shown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        className="pw-eye"
        onClick={copy}
        title="Copy password"
        aria-label="Copy password"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-[var(--green)]" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </span>
  )
}
