// Row rendering + status icons + flag/filter helpers for ProxyPicker.
// Pure presentation; the picker owns search/filter state.

import * as React from 'react'
import { CheckCircle2, Globe } from 'lucide-react'
import type { ProxyRow } from '@/lib/proxies'
import { Flag } from '@/components/Flag'

export function ProxyPickerRow({
  proxy: p,
  isCurrent,
  usage,
  disabled,
  onPick
}: {
  proxy: ProxyRow
  isCurrent: boolean
  usage: number
  disabled: boolean
  onPick: () => void
}): React.ReactElement {
  return (
    <button
      disabled={disabled || isCurrent}
      onClick={onPick}
      className={
        'w-full px-3 py-2.5 text-left flex items-center gap-3 text-xs transition-colors ' +
        (isCurrent
          ? 'bg-[var(--red-soft)] cursor-default'
          : 'hover:bg-[var(--hover)] disabled:opacity-40 disabled:cursor-not-allowed')
      }
    >
      <Status proxy={p} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--t1)] truncate">
            {p.label || `${p.host}:${p.port}`}
          </span>
          {p.proxy_number != null && (
            <span className="mono text-[10px] text-[var(--t4)] tabular-nums">
              #{p.proxy_number}
            </span>
          )}
        </div>
        {p.label && (
          <div className="mono text-[11px] text-[var(--t3)] truncate">
            {p.host}:{p.port}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 text-[11px] text-[var(--t3)]">
        {usage > 0 && (
          <span
            title={`Used by ${usage} profile${usage === 1 ? '' : 's'}`}
            className="px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--t3)]"
          >
            {usage}× used
          </span>
        )}
        <span><Flag code={p.country_code} /></span>
        <span className="uppercase">{p.country_code ?? '—'}</span>
        <span className="uppercase">{p.proxy_type}</span>
      </div>
      {isCurrent && (
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--red)] text-white">
          CURRENT
        </span>
      )}
    </button>
  )
}

function Status({ proxy }: { proxy: ProxyRow }): React.ReactElement {
  if (proxy.last_test_ok === true) {
    return (
      <span title="Last test: OK" className="shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)]" />
      </span>
    )
  }
  if (proxy.last_test_ok === false) {
    return (
      <span
        title="Last test: failed"
        className="shrink-0 w-3.5 h-3.5 inline-flex items-center justify-center rounded-full bg-red-500/15 text-[var(--red)] text-[10px]"
      >
        ✗
      </span>
    )
  }
  return (
    <span title="Not tested yet" className="shrink-0">
      <Globe className="w-3.5 h-3.5 text-[var(--t4)]" />
    </span>
  )
}

export function PickerFilterChip({
  label,
  count,
  active,
  onClick
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ' +
        (active
          ? 'border-brand-red/40 bg-[var(--red-soft)] text-[var(--red)]'
          : 'border-[var(--line)] bg-[var(--panel)] text-[var(--t2)] hover:border-[var(--red)]/30')
      }
    >
      {label}
      <span className="opacity-70">· {count}</span>
    </button>
  )
}
