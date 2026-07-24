import * as React from 'react'
import { cn } from '@/lib/cn'

export type ProfileStatus = 'open' | 'idle' | 'error'

const config: Record<
  ProfileStatus,
  { label: string; pillClass: string; dotClass: string }
> = {
  open: {
    label: 'Open',
    pillClass: 'bg-emerald-500/15 text-[var(--green)]',
    dotClass: 'bg-[var(--green)] pulse-soft'
  },
  idle: {
    label: 'Idle',
    pillClass: 'bg-neutral-300/40 dark:bg-night-raised text-[var(--t3)]',
    dotClass: 'bg-neutral-400 dark:bg-night-muted'
  },
  error: {
    label: 'Error',
    pillClass: 'bg-red-500/15 text-[var(--red)]',
    dotClass: 'bg-red-500'
  }
}

export function StatusPill({ status }: { status: ProfileStatus }): React.ReactElement {
  const c = config[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium',
        c.pillClass
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dotClass)} />
      {c.label}
    </span>
  )
}
