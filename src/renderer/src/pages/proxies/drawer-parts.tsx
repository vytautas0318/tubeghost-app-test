// Small presentational helpers used inside ProxyDetailDrawer.
// Pulled out to keep the drawer file under the 250-line max.

import * as React from 'react'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/cn'

export function DrawerSection({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className="bg-[var(--panel)] border border-[var(--line)] rounded-xl p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--t3)] mb-3">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function KV({
  k,
  v,
  mono = false
}: {
  k: string
  v: string
  mono?: boolean
}): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[var(--t3)]">{k}</span>
      <span
        className={cn('text-[var(--t1)] truncate text-right', mono && 'mono')}
        title={v}
      >
        {v}
      </span>
    </div>
  )
}

export function KVCopy({
  k,
  v,
  onCopy
}: {
  k: string
  v: string
  onCopy: (v: string) => void
}): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const handle = (): void => {
    onCopy(v)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[var(--t3)]">{k}</span>
      <button
        onClick={handle}
        className="mono text-[var(--t1)] hover:text-[var(--red)] flex items-center gap-1.5"
      >
        {v}
        {copied ? (
          <Check className="w-3 h-3 text-[var(--green)]" />
        ) : (
          <Copy className="w-3 h-3 text-brand-dark/30 dark:text-night-muted" />
        )}
      </button>
    </div>
  )
}
