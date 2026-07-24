import * as React from 'react'
import { cn } from '@/lib/cn'
import type { ProxySource, ProxyStatus } from '@/lib/proxies'

export function SourceBadge({ source }: { source: ProxySource }): React.ReactElement {
  const config = {
    tubeproxies: {
      label: 'TUBEPROXIES',
      cls: 'bg-[var(--red-soft)] text-[var(--red)]'
    },
    custom: {
      label: 'CUSTOM',
      cls: 'bg-neutral-300/40 dark:bg-night-raised text-[var(--t2)]'
    }
  }[source]
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider',
        config.cls
      )}
    >
      {config.label}
    </span>
  )
}

export function StatusPill({ status }: { status: ProxyStatus }): React.ReactElement {
  const config: Record<ProxyStatus, { label: string; pill: string; dot: string }> = {
    active: {
      label: 'Active',
      pill: 'bg-emerald-500/15 text-[var(--green)]',
      dot: 'bg-[var(--green)]'
    },
    expired: {
      label: 'Expired',
      pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
      dot: 'bg-amber-500'
    },
    released: {
      label: 'Released',
      pill: 'bg-neutral-300/40 dark:bg-night-raised text-[var(--t3)]',
      dot: 'bg-neutral-400 dark:bg-night-muted'
    },
    error: {
      label: 'Error',
      pill: 'bg-red-500/15 text-[var(--red)]',
      dot: 'bg-red-500'
    }
  }
  const c = config[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium',
        c.pill
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
      {c.label}
    </span>
  )
}
