import * as React from 'react'

export function ProxiesHeader({
  counts,
  lastSync,
  children
}: {
  counts: { total: number; active: number; expired: number }
  lastSync: string | null
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <header className="px-8 pt-6 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--t1)] tracking-tight">
          Proxies
        </h1>
        <p className="text-sm text-[var(--t3)] mt-1">
          {counts.active} active
          {counts.expired > 0 && <> · {counts.expired} expired</>} · {counts.total} total
          {lastSync && <> · last sync {lastSync}</>}
        </p>
      </div>
      <div className="flex items-center gap-2.5">{children}</div>
    </header>
  )
}
