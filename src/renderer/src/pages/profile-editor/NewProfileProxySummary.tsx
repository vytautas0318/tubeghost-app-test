// One-line "what proxy will this profile get?" row shown under the General
// tab's identity fields while creating a profile. Keeps the auto-assignment
// visible (it happens without input, so it must not be invisible) and gives a
// one-click jump to the Proxy tab to change it.

import * as React from 'react'
import { Globe } from 'lucide-react'
import { proxyLabel } from './proxy-draft'
import type { NewProfileProxyState } from './useNewProfileProxy'

function describe(state: NewProfileProxyState): string {
  const { draft, unused } = state
  switch (draft.mode) {
    case 'none':
      return 'No proxy'
    case 'pool':
      return draft.pick ? proxyLabel(draft.pick) : 'Not chosen yet — pick one on the Proxy tab'
    case 'custom': {
      const host = draft.fields.host.trim()
      if (!host) return 'Custom — no host entered yet'
      return `${draft.fields.type.toUpperCase()} · ${host}:${draft.fields.port || '—'}`
    }
    case 'auto':
      if (unused === null) return 'Auto — checking the pool…'
      if (unused.length === 0) return 'Auto — no unused proxy available, will create without one'
      return `Auto — ${proxyLabel(unused[0])}`
  }
}

export function NewProfileProxySummary({
  state,
  onConfigure
}: {
  state: NewProfileProxyState
  onConfigure: () => void
}): React.ReactElement {
  return (
    <div className="mt-4 pt-4 border-t border-[var(--line)] flex items-center justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <Globe className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--t3)]" />
        <div className="min-w-0">
          <div className="text-[11px] uppercase font-semibold tracking-wider text-[var(--t3)]">
            Proxy
          </div>
          <div className="text-xs text-[var(--t1)] mono truncate">{describe(state)}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onConfigure}
        className="shrink-0 px-2.5 py-1 text-xs font-medium border border-[var(--line)] rounded-md text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--hover)]"
      >
        Change
      </button>
    </div>
  )
}
